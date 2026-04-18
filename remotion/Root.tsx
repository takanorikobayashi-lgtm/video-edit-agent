import React from "react";
import { Composition, getInputProps } from "remotion";
import { VideoComposition } from "./VideoComposition";
import type { CompositionProps } from "./types";

const DEFAULT_PROPS: CompositionProps = {
  segments: [],
  framesDir: "",
  metadata: { width: 1920, height: 1080, originalFps: 1 },
  totalFrames: 300,
  fps: 30,
};

export const RemotionRoot: React.FC = () => {
  const inputProps = getInputProps() as Partial<CompositionProps>;
  const props = { ...DEFAULT_PROPS, ...inputProps };
  return (
    <Composition
      id="VideoComposition"
      component={VideoComposition}
      durationInFrames={props.totalFrames || 300}
      fps={props.fps || 30}
      width={1920}
      height={1080}
      defaultProps={props}
    />
  );
};
