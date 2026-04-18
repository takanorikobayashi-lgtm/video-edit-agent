// ============================================================
// 04-render: Mode A → Remotion、Mode B → ffmpeg字幕焼き付け
// ============================================================

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  PipelineConfig,
  AnalysisScript,
  AudioManifest,
  VideoMetadata,
  StepResult,
} from "./types";
import { log, logStepStart, logStepDone, logError } from "./logger";

/** Remotion のinputPropsとして渡すデータを構築（Mode A用） */
function buildRenderProps(config: PipelineConfig): object {
  const scriptPath = path.join(config.tmpDir, "script.json");
  const manifestPath = path.join(config.tmpDir, "audio", "manifest.json");
  const metadataPath = path.join(config.tmpDir, "metadata.json");

  if (!fs.existsSync(scriptPath)) {
    throw new Error("script.json が見つかりません");
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error("audio/manifest.json が見つかりません");
  }
  if (!fs.existsSync(metadataPath)) {
    throw new Error("metadata.json が見つかりません");
  }

  const script: AnalysisScript = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const manifest: AudioManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const metadata: VideoMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  // keep=true のセグメントに音声を紐付け
  const activeSegments = script.segments
    .filter((s) => s.keep)
    .map((seg) => {
      const audioEntry = manifest.entries.find((e) => e.segmentId === seg.id);
      return {
        ...seg,
        audioFile: audioEntry?.filePath ?? null,
        audioDuration: audioEntry?.duration ?? 0,
        displayDuration: Math.max(
          seg.endTime - seg.startTime,
          audioEntry?.duration ?? 0
        ),
      };
    });

  const totalDurationSec = activeSegments.reduce(
    (sum, seg) => sum + seg.displayDuration,
    0
  );
  const totalFrames = Math.ceil(totalDurationSec * config.outputFps);

  return {
    segments: activeSegments,
    framesDir: path.resolve(config.tmpDir, "frames"),
    metadata: {
      width: metadata.width,
      height: metadata.height,
      originalFps: metadata.fps,
    },
    totalFrames,
    fps: config.outputFps,
  };
}

/** ffmpegが subtitles フィルター（libass）を持っているか確認 */
function hasSubtitlesFilter(): boolean {
  try {
    const out = execFileSync("ffmpeg", ["-filters"], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return out.includes(" subtitles ");
  } catch {
    return false;
  }
}

/** Mode B: ffmpegで字幕を焼き付け。libassがなければソフト字幕(mov_text)で代替 */
async function renderShortVideo(
  config: PipelineConfig,
  inputFile: string,
  outputPath: string
): Promise<void> {
  const srtPath = path.join(config.tmpDir, "subtitles.srt");

  if (!fs.existsSync(srtPath)) {
    throw new Error("subtitles.srt が見つかりません。先に transcribe を実行してください");
  }

  if (hasSubtitlesFilter()) {
    // ── ハード字幕: subtitles フィルターで焼き付け ──
    // ffmpeg フィルタ文字列内のコロンとカンマをエスケープ
    const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    log("render", `字幕焼き付け（ハード字幕）: ${srtPath}`);

    execFileSync("ffmpeg", [
      "-y",
      "-i", inputFile,
      "-vf", `subtitles=${escapedSrt}:force_style=FontSize=24\\,PrimaryColour=&H00FFFFFF\\,BorderStyle=3\\,Outline=2\\,Shadow=1\\,MarginV=30`,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "18",
      "-c:a", "copy",
      outputPath,
    ], { stdio: "inherit" });

    log("render", "ハード字幕焼き付け完了");
  } else {
    // ── ソフト字幕: SRTをmov_textトラックとして埋め込み ──
    log("render", "libassが未対応のため、ソフト字幕（mov_text）で埋め込みます");
    log("render", "ヒント: brew reinstall ffmpeg でlibassを有効化するとハード字幕が使えます");

    execFileSync("ffmpeg", [
      "-y",
      "-i", inputFile,
      "-i", srtPath,
      "-map", "0",
      "-map", "1",
      "-c:v", "copy",
      "-c:a", "copy",
      "-c:s", "mov_text",
      outputPath,
    ], { stdio: "inherit" });

    log("render", "ソフト字幕埋め込み完了（VLC等で字幕ON推奨）");
  }
}

/**
 * Mode A: Remotionが使えない場合のffmpegフォールバック
 * フレーム画像 + ナレーション音声をシンプルに結合する
 */
async function ffmpegFallbackRender(
  config: PipelineConfig,
  outputPath: string
): Promise<void> {
  const scriptPath = path.join(config.tmpDir, "script.json");
  const manifestPath = path.join(config.tmpDir, "audio", "manifest.json");
  const script: AnalysisScript = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const manifest: AudioManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  const activeEntries = manifest.entries.filter((e) =>
    script.segments.find((s) => s.id === e.segmentId && s.keep)
  );

  if (activeEntries.length === 0) {
    throw new Error("有効なセグメントが見つかりません");
  }

  const concatListPath = path.join(config.tmpDir, "audio-concat.txt");
  const concatContent = activeEntries
    .map((e) => `file '${e.filePath}'`)
    .join("\n");
  fs.writeFileSync(concatListPath, concatContent);

  const mergedAudioPath = path.join(config.tmpDir, "merged-audio.mp3");
  execFileSync("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatListPath,
    "-c", "copy",
    mergedAudioPath,
  ]);

  const framesDir = path.join(config.tmpDir, "frames");
  const activeFramePattern = path.join(framesDir, "frame-%06d.png");

  execFileSync("ffmpeg", [
    "-y",
    "-framerate", "1",
    "-i", activeFramePattern,
    "-i", mergedAudioPath,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-vf", `scale=${config.outputWidth}:${config.outputHeight}:force_original_aspect_ratio=decrease,pad=${config.outputWidth}:${config.outputHeight}:(ow-iw)/2:(oh-ih)/2`,
    "-c:a", "aac",
    "-shortest",
    outputPath,
  ]);

  log("render", "ffmpeg フォールバック完了");
}

/** メインレンダリング関数 — detection.json のモードで A/B を分岐 */
export async function render(config: PipelineConfig): Promise<StepResult> {
  const start = Date.now();
  logStepStart("render");

  try {
    // detection.json からモードと inputFile を取得
    const detectionPath = path.join(config.tmpDir, "detection.json");
    let mode: "screen" | "short" = "screen";

    if (fs.existsSync(detectionPath)) {
      const detection = JSON.parse(fs.readFileSync(detectionPath, "utf-8"));
      if (detection.modeConfig?.mode) {
        mode = detection.modeConfig.mode;
      }
      if (detection.inputFile) {
        config.inputFile = detection.inputFile;
        log("render", `入力ファイル: ${config.inputFile}`);
      }
    }

    log("render", `レンダリングモード: ${mode === "short" ? "Mode B (ショート動画)" : "Mode A (画面収録)"}`);

    // 出力ディレクトリ準備
    fs.mkdirSync(config.outputDir, { recursive: true });
    const inputBaseName = path.basename(config.inputFile, path.extname(config.inputFile));
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const outputPath = path.join(config.outputDir, `${inputBaseName}_${timestamp}.mp4`);

    if (mode === "short") {
      // ─── Mode B: ffmpegで字幕焼き付け ───
      await renderShortVideo(config, config.inputFile, outputPath);
    } else {
      // ─── Mode A: Remotionでレンダリング ───
      const props = buildRenderProps(config);
      log("render", "レンダリング設定を構築しました");

      const propsPath = path.join(config.tmpDir, "render-props.json");
      fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));

      const remotionEntry = path.join(__dirname, "..", "remotion", "index.ts");
      log("render", `Remotion レンダリング開始... → ${outputPath}`);

      try {
        execFileSync("npx", [
          "remotion",
          "render",
          remotionEntry,
          config.remotionCompositionId,
          outputPath,
          "--props", propsPath,
          "--codec", "h264",
          "--image-format", "jpeg",
          "--log", "warn",
        ], {
          stdio: "inherit",
          cwd: path.join(__dirname, ".."),
        });
      } catch {
        log("render", "Remotion が未インストールです。ffmpeg フォールバックで合成します...");
        await ffmpegFallbackRender(config, outputPath);
      }
    }

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      log("render", `✓ 出力完了: ${outputPath} (${sizeMB}MB)`);
    }

    const durationMs = Date.now() - start;
    logStepDone("render", durationMs);

    return {
      step: "render",
      success: true,
      durationMs,
      outputPath,
    };
  } catch (error) {
    logError("render", error);
    return {
      step: "render",
      success: false,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
