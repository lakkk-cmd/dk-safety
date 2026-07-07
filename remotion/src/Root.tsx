import React from "react";
import { Composition } from "remotion";
import { HookTitle } from "./HookTitle";
import {
  Master,
  MASTER_DEFAULT_PROPS,
  calculateMasterMetadata,
} from "./Master";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 워커가 렌더하는 메인 컴포지션 — video_jobs.scenes를 씬 시퀀스로 합성 */}
      <Composition
        id="Master"
        component={Master}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={MASTER_DEFAULT_PROPS}
        calculateMetadata={calculateMasterMetadata}
      />
      {/* 단일 씬 미리보기/렌더 테스트용 */}
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
    </>
  );
};
