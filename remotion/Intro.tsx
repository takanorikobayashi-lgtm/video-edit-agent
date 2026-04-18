import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleSpring = spring({ frame: frame - 10, fps, config: { stiffness: 100, damping: 18, mass: 1.2 } });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const titleY = interpolate(titleSpring, [0, 1], [40, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const subSpring = spring({ frame: frame - 30, fps, config: { stiffness: 80, damping: 16, mass: 1 } });
  const subOpacity = interpolate(subSpring, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const dotSpring = spring({ frame: frame - 5, fps, config: { stiffness: 200, damping: 12 } });
  const dotScale = interpolate(dotSpring, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const fadeOut = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeOut, background: "radial-gradient(ellipse at 50% 45%, #1a1a2e 0%, #0a0a0a 70%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#4CAF50", boxShadow: "0 0 20px rgba(76,175,80,0.6)", marginBottom: 32, transform: `scale(${dotScale})` }} />
      <h1 style={{ fontFamily: "sans-serif", fontSize: 56, fontWeight: 700, color: "#FAFAFA", margin: 0, opacity: titleOpacity, transform: `translateY(${titleY}px)` }}>
        操作チュートリアル
      </h1>
      <p style={{ fontFamily: "monospace", fontSize: 18, color: "rgba(255,255,255,0.4)", letterSpacing: 3, marginTop: 16, opacity: subOpacity }}>
        Auto-generated tutorial
      </p>
    </AbsoluteFill>
  );
};
