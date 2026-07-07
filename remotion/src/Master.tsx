import React from "react";
import { AbsoluteFill, Audio, Series, staticFile } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { BRAND, FONT_FAMILY } from "./brand";
import { HookTitle, type HookTitleProps } from "./HookTitle";

// 워커가 video_jobs.scenes를 이 형태로 변환해 inputProps로 넘긴다.
// audio는 remotion/public/ 기준 상대 경로 (staticFile로 로드).
export type MasterScene = {
  compositionId: string;
  props: Record<string, unknown>;
  durationInFrames: number;
  audio?: string;
};

export type MasterProps = {
  scenes: MasterScene[];
};

const SCENE_COMPONENTS: Record<
  string,
  React.ComponentType<Record<string, unknown>>
> = {
  HookTitle: HookTitle as unknown as React.ComponentType<
    Record<string, unknown>
  >,
};

// 등록되지 않은 컴포지션 ID가 오면 렌더를 죽이지 않고 눈에 띄는 플레이스홀더를 보여준다
const UnknownScene: React.FC<{ compositionId: string }> = ({
  compositionId,
}) => (
  <AbsoluteFill
    style={{
      background: BRAND.navy,
      alignItems: "center",
      justifyContent: "center",
      fontFamily: FONT_FAMILY,
      color: BRAND.gold,
      fontSize: 56,
      textAlign: "center",
      padding: 80,
    }}
  >
    미등록 씬 템플릿: {compositionId}
  </AbsoluteFill>
);

export const calculateMasterMetadata: CalculateMetadataFunction<
  MasterProps
> = ({ props }) => ({
  durationInFrames: Math.max(
    1,
    props.scenes.reduce((sum, s) => sum + s.durationInFrames, 0)
  ),
});

export const Master: React.FC<MasterProps> = ({ scenes }) => {
  return (
    <AbsoluteFill style={{ background: BRAND.navy }}>
      <Series>
        {scenes.map((scene, i) => {
          const Component = SCENE_COMPONENTS[scene.compositionId];
          return (
            <Series.Sequence key={i} durationInFrames={scene.durationInFrames}>
              {Component ? (
                <Component {...scene.props} />
              ) : (
                <UnknownScene compositionId={scene.compositionId} />
              )}
              {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};

export const MASTER_DEFAULT_PROPS: MasterProps = {
  scenes: [
    {
      compositionId: "HookTitle",
      props: {
        title: "누전차단기가 자꾸 떨어진다면?",
        subtitle: "우리집 전기주치의",
        iconType: "warning",
      } satisfies HookTitleProps,
      durationInFrames: 90,
    },
  ],
};
