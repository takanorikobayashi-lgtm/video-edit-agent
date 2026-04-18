// ============================================================
// 01-extract: 録画MP4 → フレーム抽出 (ffmpeg)
// ============================================================

import { execSync, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { PipelineConfig, VideoMetadata, StepResult } from "./types";
import { log, logStepStart, logStepDone, logError } from "./logger";

/** ffmpeg がインストールされているか確認 */
function ensureFfmpeg(): void {
  try {
    execSync("which ffmpeg", { stdio: "ignore" });
  } catch {
    throw new Error(
      "ffmpeg が見つかりません。brew install ffmpeg または apt install ffmpeg でインストールしてください"
    );
  }
}

/** ffprobe で動画メタデータを取得 */
function probeVideo(inputFile: string): { duration: number; width: number; height: number } {
  const raw = execFileSync("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    inputFile,
  ]).toString();

  const info = JSON.parse(raw);
  const videoStream = info.streams?.find((s: any) => s.codec_type === "video");

  if (!videoStream) {
    throw new Error("動画ストリームが見つかりません");
  }

  return {
    duration: parseFloat(info.format?.duration ?? "0"),
    width: videoStream.width ?? 1920,
    height: videoStream.height ?? 1080,
  };
}

/** フレームを抽出 */
export async function extract(config: PipelineConfig): Promise<StepResult> {
  const start = Date.now();
  logStepStart("extract");

  try {
    ensureFfmpeg();

    // 入力ファイル確認
    if (!fs.existsSync(config.inputFile)) {
      throw new Error(`入力ファイルが見つかりません: ${config.inputFile}`);
    }

    // 出力ディレクトリ準備
    const framesDir = path.join(config.tmpDir, "frames");
    fs.mkdirSync(framesDir, { recursive: true });

    // 既存フレームをクリア
    const existing = fs.readdirSync(framesDir).filter((f) => f.endsWith(".png"));
    for (const f of existing) {
      fs.unlinkSync(path.join(framesDir, f));
    }

    // 動画情報取得
    const probe = probeVideo(config.inputFile);
    log("extract", `動画: ${probe.width}x${probe.height}, ${probe.duration.toFixed(1)}秒`);

    // ffmpeg でフレーム抽出
    const outputPattern = path.join(framesDir, "frame-%06d.png");
    log("extract", `フレーム抽出中... (${config.extractFps} fps)`);

    execFileSync("ffmpeg", [
      "-i", config.inputFile,
      "-vf", `fps=${config.extractFps}`,
      "-q:v", "2",                  // 高品質PNG
      "-hide_banner",
      "-loglevel", "warning",
      outputPattern,
    ]);

    // 結果集計
    const frames = fs.readdirSync(framesDir).filter((f) => f.endsWith(".png")).sort();
    const totalFrames = frames.length;
    log("extract", `${totalFrames} フレーム抽出完了`);

    // メタデータ保存
    const metadata: VideoMetadata = {
      inputFile: path.resolve(config.inputFile),
      duration: probe.duration,
      width: probe.width,
      height: probe.height,
      fps: config.extractFps,
      totalFrames,
      framesDir: path.resolve(framesDir),
      createdAt: new Date().toISOString(),
      hasAudio: false,
    };

    const metadataPath = path.join(config.tmpDir, "metadata.json");
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    const durationMs = Date.now() - start;
    logStepDone("extract", durationMs);

    return {
      step: "extract",
      success: true,
      durationMs,
      outputPath: framesDir,
    };
  } catch (error) {
    logError("extract", error);
    return {
      step: "extract",
      success: false,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
