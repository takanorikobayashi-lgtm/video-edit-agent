import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  PipelineConfig,
  ProductionPlan,
  AnalysisScript,
  AudioManifest,
  VideoMetadata,
  StepResult,
} from "../types";
import { log, logStepStart, logStepDone, logError } from "../logger";
import { styleToForceStyle } from "./subtitler";

function buildRenderProps(config: PipelineConfig): object {
  const scriptPath = path.join(config.tmpDir, "script.json");
  const manifestPath = path.join(config.tmpDir, "audio", "manifest.json");
  const metadataPath = path.join(config.tmpDir, "metadata.json");

  if (!fs.existsSync(scriptPath)) throw new Error("script.json が見つかりません");
  if (!fs.existsSync(manifestPath)) throw new Error("audio/manifest.json が見つかりません");
  if (!fs.existsSync(metadataPath)) throw new Error("metadata.json が見つかりません");

  const script: AnalysisScript = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const manifest: AudioManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const metadata: VideoMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  const activeSegments = script.segments
    .filter((s) => s.keep)
    .map((seg) => {
      const audioEntry = manifest.entries.find((e) => e.segmentId === seg.id);
      return {
        ...seg,
        audioFile: audioEntry?.filePath ?? null,
        audioDuration: audioEntry?.duration ?? 0,
        displayDuration: Math.max(seg.endTime - seg.startTime, audioEntry?.duration ?? 0),
      };
    });

  const totalDurationSec = activeSegments.reduce((sum, seg) => sum + seg.displayDuration, 0);
  const totalFrames = Math.ceil(totalDurationSec * config.outputFps);

  return {
    segments: activeSegments,
    framesDir: path.resolve(config.tmpDir, "frames"),
    metadata: { width: metadata.width, height: metadata.height, originalFps: metadata.fps },
    totalFrames,
    fps: config.outputFps,
  };
}

function hasSubtitlesFilter(): boolean {
  try {
    const out = execFileSync("ffmpeg", ["-filters"], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return out.includes(" subtitles ");
  } catch {
    return false;
  }
}

async function ffmpegFallbackRender(config: PipelineConfig, outputPath: string): Promise<void> {
  const scriptPath = path.join(config.tmpDir, "script.json");
  const manifestPath = path.join(config.tmpDir, "audio", "manifest.json");
  const script: AnalysisScript = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const manifest: AudioManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  const activeEntries = manifest.entries.filter((e) =>
    script.segments.find((s) => s.id === e.segmentId && s.keep)
  );

  if (activeEntries.length === 0) throw new Error("有効なセグメントが見つかりません");

  const concatListPath = path.join(config.tmpDir, "audio-concat.txt");
  fs.writeFileSync(concatListPath, activeEntries.map((e) => `file '${e.filePath}'`).join("\n"));

  const mergedAudioPath = path.join(config.tmpDir, "merged-audio.mp3");
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatListPath, "-c", "copy", mergedAudioPath]);

  const framesDir = path.join(config.tmpDir, "frames");
  execFileSync("ffmpeg", [
    "-y", "-framerate", "1", "-i", path.join(framesDir, "frame-%06d.png"),
    "-i", mergedAudioPath,
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-vf", `scale=${config.outputWidth}:${config.outputHeight}:force_original_aspect_ratio=decrease,pad=${config.outputWidth}:${config.outputHeight}:(ow-iw)/2:(oh-ih)/2`,
    "-c:a", "aac", "-shortest", outputPath,
  ]);

  log("renderer", "ffmpeg フォールバック完了");
}

async function renderShortVideo(
  config: PipelineConfig,
  plan: ProductionPlan,
  inputFile: string,
  outputPath: string
): Promise<void> {
  if (plan.subtitles.enabled) {
    const srtPath = path.join(config.tmpDir, "subtitles-styled.srt");
    if (!fs.existsSync(srtPath)) throw new Error("subtitles-styled.srt が見つかりません。先に subtitler を実行してください");

    if (hasSubtitlesFilter()) {
      const forceStyle = styleToForceStyle(plan.subtitles.style);
      const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      execFileSync("ffmpeg", [
        "-y", "-i", inputFile,
        "-vf", `subtitles=${escapedSrt}:force_style=${forceStyle}`,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-c:a", "copy", outputPath,
      ], { stdio: "inherit" });
    } else {
      log("renderer", "libass 未対応 → ソフト字幕 (mov_text) で埋め込み");
      execFileSync("ffmpeg", [
        "-y", "-i", inputFile, "-i", srtPath,
        "-map", "0", "-map", "1", "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text", outputPath,
      ], { stdio: "inherit" });
    }
  } else {
    execFileSync("ffmpeg", ["-y", "-i", inputFile, "-c", "copy", outputPath], { stdio: "inherit" });
  }
}

export async function run(config: PipelineConfig, plan: ProductionPlan): Promise<StepResult> {
  const start = Date.now();
  logStepStart("renderer");

  try {
    fs.mkdirSync(config.outputDir, { recursive: true });
    const inputBaseName = path.basename(config.inputFile, path.extname(config.inputFile));
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const outputPath = path.join(config.outputDir, `${inputBaseName}_${timestamp}.mp4`);

    if (plan.mode === "short") {
      await renderShortVideo(config, plan, config.inputFile, outputPath);
    } else {
      const props = buildRenderProps(config);

      const propsPath = path.join(config.tmpDir, "render-props.json");
      const existingProps = fs.existsSync(propsPath)
        ? JSON.parse(fs.readFileSync(propsPath, "utf-8"))
        : {};
      fs.writeFileSync(propsPath, JSON.stringify({ ...existingProps, ...props }, null, 2));

      const remotionEntry = path.join(__dirname, "..", "..", "remotion", "index.ts");
      try {
        execFileSync("npx", [
          "remotion", "render", remotionEntry, config.remotionCompositionId,
          outputPath, "--props", propsPath, "--codec", "h264", "--image-format", "jpeg", "--log", "warn",
        ], { stdio: "inherit", cwd: path.join(__dirname, "..", "..") });
      } catch {
        log("renderer", "Remotion 失敗 → ffmpeg フォールバック");
        await ffmpegFallbackRender(config, outputPath);
      }
    }

    if (fs.existsSync(outputPath)) {
      const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
      log("renderer", `✓ 出力完了: ${outputPath} (${sizeMB}MB)`);
    }

    const durationMs = Date.now() - start;
    logStepDone("renderer", durationMs);
    return { step: "render", success: true, durationMs, outputPath };
  } catch (error) {
    logError("renderer", error);
    return { step: "render", success: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
  }
}
