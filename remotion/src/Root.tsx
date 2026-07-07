import React from "react";
import { Composition } from "remotion";
import { HookTitle } from "./HookTitle";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="HookTitle"
      component={HookTitle}
      durationInFrames={90}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        title: "누전차단기가 자꾸 떨어진다면?",
        subtitle: "우리집 전기주치의",
        iconType: "warning" as const,
      }}
    />
  );
};
