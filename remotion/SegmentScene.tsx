import React from "react";
import { AbsoluteFill, Img, Audio, useCurrentFrame, useVideoConfig, interpolate, staticFile } from "remotion";
import { Subtitle } from "./Subtitle";
import type { SegmentSceneProps } from "./types";

type Effect = "zoomIn" | "zoomOut" | "panLeft" | "panRight";

function getEffect(segmentId: number): Effect {
  const effects: Effect[] = ["zoomIn", "zoomOut", "panLeft", "panRight"];
  return effects[segmentId % effects.length];
}

function getTransform(effect: Effect, progress: number): string {
  switch (effect) {
    case "zoomIn":
      return `scale(${1.0 + progress * 0.08})`;
    case "zoomOut":
      return `scale(${1.08 - progress * 0.08})`;
    case "panLeft":
      return `scale(1.06) translateX(${-progress * 3}%)`;
    case "panRight":
      return `scale(1.06) translateX(${progress * 3}%)`;
  }
}

export const SegmentScene: React.FC<SegmentSceneProps> = ({
  segment,
  framesDir,
  originalFps,
  outputFps,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const FADE_FRAMES = 9;
  const TOTAL_FRAMES = 41;

  const fadeIn = interpolate(frame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [durationInFrames - FADE_FRAMES, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  // 0〜1 の進行度
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const effect = getEffect(segment.id);
  const transform = getTransform(effect, progress);

  // フレームインデックス
  const elapsedSec = frame / outputFps;
  const rawIndex = Math.floor(elapsedSec * originalFps) + segment.startFrame;
  const imageIndex = Math.min(rawIndex, Math.min(segment.endFrame, TOTAL_FRAMES - 1));
  const padded = String(imageIndex + 1).padStart(6, "0");
  const imgSrc = staticFile(`frames/frame-${padded}.png`);

  const audioSrc = segment.audioFile
    ? staticFile(`audio/${segment.audioFile.split("/").pop()}`)
    : null;

  const subtitleDelay = Math.floor(0.5 * outputFps);
  const subtitleDuration = durationInFrames - subtitleDelay - Math.floor(1.0 * outputFps);

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#0A0A0A" }}>
        <Img
          src={imgSrc}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            transform,
            transition: "none",
          }}
        />
      </AbsoluteFill>
      {audioSrc && <Audio src={audioSrc} volume={1} />}
      {subtitleDuration > 0 && (
        <Subtitle text={segment.narration} startFrame={subtitleDelay} durationInFrames={subtitleDuration} />
      )}
      <div style={{
        position: "absolute", top: 24, left: 24,
        display: "flex", alignItems: "center", gap: 8,
        opacity: interpolate(frame, [0, 20, durationInFrames - 20, durationInFrames], [0, 0.6, 0.6, 0], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        }),
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#4CAF50" }} />
        <span style={{ fontFamily: "monospace", fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
          STEP {segment.id}
        </span>
      </div>
    </AbsoluteFill>
  );
};
