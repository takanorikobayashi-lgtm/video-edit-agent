import path from "path";
import { PipelineConfig } from "./types";

const ROOT_DIR = path.resolve(__dirname, "..");

export const DEFAULT_CONFIG: PipelineConfig = {
  inputFile: path.join(ROOT_DIR, "input", "recording.mp4"),
  outputDir: path.join(ROOT_DIR, "output"),
  tmpDir: path.join(ROOT_DIR, "tmp"),
  extractFps: 1,
  cutThresholdSeconds: 3,
  ssimThreshold: 0.98,
  maxBatchSize: 20,
  batchOverlap: 2,
  elevenLabsConcurrency: 3,
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM",
  elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
  remotionCompositionId: "VideoComposition",
  outputWidth: 1920,
  outputHeight: 1080,
  outputFps: 30,
  maxRetries: 3,
};

export function loadConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
