export interface RenderSegment {
  id: number;
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
  narration: string;
  action: string;
  keep: boolean;
  audioFile: string | null;
  audioDuration: number;
  displayDuration: number;
}

export interface VideoMeta {
  width: number;
  height: number;
  originalFps: number;
}

export interface CompositionProps {
  segments: RenderSegment[];
  framesDir: string;
  metadata: VideoMeta;
  totalFrames: number;
  fps: number;
}

export interface SubtitleProps {
  text: string;
  startFrame: number;
  durationInFrames: number;
}

export interface SegmentSceneProps {
  segment: RenderSegment;
  framesDir: string;
  originalFps: number;
  outputFps: number;
}
