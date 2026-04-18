import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig, Sequence } from "remotion";
import type { SubtitleProps } from "./types";

const SubtitleInner: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const FADE_IN_FRAMES = 12;
  const FADE_OUT_FRAMES = 12;

  const fadeIn = interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [durationInFrames - FADE_OUT_FRAMES, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const slideUp = spring({ frame, fps, config: { stiffness: 200, damping: 20, mass: 0.8 } });
  const translateY = interpolate(slideUp, [0, 1], [20, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", bottom: 60, left: 0, right: 0, display: "flex", justifyContent: "center", padding: "0 80px", opacity, transform: `translateY(${translateY}px)` }}>
      <div style={{ backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 12, padding: "16px 32px", maxWidth: 1400, border: "1px solid rgba(255,255,255,0.08)" }}>
        <p style={{ fontFamily: "sans-serif", fontSize: 32, fontWeight: 500, color: "#FFFFFF", lineHeight: 1.6, textAlign: "center", margin: 0 }}>
          {text}
        </p>
      </div>
    </div>
  );
};

export const Subtitle: React.FC<SubtitleProps> = ({ text, startFrame, durationInFrames }) => {
  return (
    <Sequence from={startFrame} durationInFrames={durationInFrames} layout="none">
      <SubtitleInner text={text} />
    </Sequence>
  );
};
