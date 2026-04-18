import path from "path";
import type { PipelineConfig } from "@pipeline/types";

// web/ ディレクトリを起点にプロジェクトルートを導出
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

export function buildPipelineConfig(inputFile: string): PipelineConfig {
  return {
    inputFile,
    outputDir: path.join(PROJECT_ROOT, "output"),
    tmpDir: path.join(PROJECT_ROOT, "tmp"),
    extractFps: 1,
    cutThresholdSeconds: 3,
    ssimThreshold: 0.98,
    maxBatchSize: 20,
    batchOverlap: 2,
    elevenLabsConcurrency: 3,
    elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
    elevenLabsModelId: "eleven_multilingual_v2",
    remotionCompositionId: "VideoComposition",
    outputWidth: 1920,
    outputHeight: 1080,
    outputFps: 30,
    maxRetries: 3,
  };
}

export const INPUT_DIR = path.join(PROJECT_ROOT, "input");
export const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
