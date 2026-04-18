import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { SegmentScene } from "./SegmentScene";
import { Intro } from "./Intro";
import { Outro } from "./Outro";
import type { CompositionProps } from "./types";

const TRANSITION_FRAMES = 9;
const INTRO_DURATION_FRAMES = 90;
const OUTRO_DURATION_FRAMES = 90;

export const VideoComposition: React.FC<CompositionProps> = ({
  segments,
  framesDir,
  metadata,
  fps,
}) => {
  const { fps: configFps } = useVideoConfig();
  const outputFps = fps || configFps;
  const activeSegments = segments.filter((s) => s.keep);

  if (activeSegments.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontSize: 24 }}>
        セグメントが見つかりません
      </AbsoluteFill>
    );
  }

  let currentFrame = INTRO_DURATION_FRAMES;
  const timeline = activeSegments.map((segment) => {
    const durationFrames = Math.ceil(segment.displayDuration * outputFps);
    const startFrame = currentFrame;
    currentFrame += durationFrames - TRANSITION_FRAMES;
    return { segment, startFrame, durationFrames };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0A" }}>
      <Sequence from={0} durationInFrames={INTRO_DURATION_FRAMES + TRANSITION_FRAMES}>
        <Intro />
      </Sequence>
      {timeline.map(({ segment, startFrame, durationFrames }) => (
        <Sequence key={segment.id} from={startFrame} durationInFrames={durationFrames} layout="none">
          <SegmentScene
            segment={segment}
            framesDir={framesDir}
            originalFps={metadata.originalFps}
            outputFps={outputFps}
          />
        </Sequence>
      ))}
      <Sequence from={currentFrame} durationInFrames={OUTRO_DURATION_FRAMES}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};
