import { PipelineConfig as OriginalConfig } from "./types";

export type VideoMode = "screen" | "short";
export type VideoPurpose = "tutorial" | "tiktok" | "vlog" | "promo" | "lecture";
export type EffectType = "zoomIn" | "zoomOut" | "panLeft" | "panRight" | "none";

export interface VideoMode_Detection {
  mode: VideoMode;
  purpose: VideoPurpose;
  confidence: number;
  hasSpeech: boolean;
  hasScreenContent: boolean;
  durationSec: number;
  reasoning: string;
}

export interface ModeConfig {
  mode: VideoMode;
  purpose: VideoPurpose;
  subtitles: boolean;
  narration: boolean;
  effects: boolean;
  effectTypes: EffectType[];
  cutSilence: boolean;
}

export interface PipelineConfig {
  inputFile: string;
  outputDir: string;
  tmpDir: string;
  extractFps: number;
  cutThresholdSeconds: number;
  ssimThreshold: number;
  maxBatchSize: number;
  batchOverlap: number;
  elevenLabsConcurrency: number;
  elevenLabsVoiceId: string;
  elevenLabsModelId: string;
  remotionCompositionId: string;
  outputWidth: number;
  outputHeight: number;
  outputFps: number;
  maxRetries: number;
}

export type PipelineStep =
  | "detect"
  | "extract"
  | "analyze"
  | "transcribe"
  | "narrate"
  | "subtitle"
  | "render";

export interface StepResult {
  step: PipelineStep;
  success: boolean;
  durationMs: number;
  outputPath?: string;
  error?: string;
}

export interface ScriptSegment {
  id: number;
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
  narration: string;
  action: string;
  keep: boolean;
  keyFrameIndex?: number;
}

export interface CutRegion {
  startTime: number;
  endTime: number;
  reason: string;
}

export interface AnalysisScript {
  segments: ScriptSegment[];
  cuts: CutRegion[];
  totalDuration: number;
  analyzedFrames: number;
}

export interface SubtitleEntry {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface AudioEntry {
  segmentId: number;
  filePath: string;
  duration: number;
  characterCount: number;
}

export interface AudioManifest {
  entries: AudioEntry[];
  totalDuration: number;
  totalCharacters: number;
  voiceId: string;
}

export interface VideoMetadata {
  inputFile: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  framesDir: string;
  createdAt: string;
  hasAudio: boolean;
  audioSampleRate?: number;
}
