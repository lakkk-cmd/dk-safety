import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND, FONT_FAMILY } from "./brand";
import { ensurePretendard } from "./fonts";

export type DiagramProps = {
  title: string;
  steps: string[];
};

// 단계 도해 — 번호 박스가 세로 흐름으로 연결되고 순차적으로 골드 하이라이트
const STEP_STAGGER_FRAMES = 18;

export const Diagram: React.FC<DiagramProps> = ({ title, steps }) => {
  ensurePretendard();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 20%, #14345C 0%, ${BRAND.navy} 70%)`,
        fontFamily: FONT_FAMILY,
        padding: "150px 90px",
      }}
    >
      <div
        style={{
          opacity: titleSpring,
          transform: `translateY(${interpolate(titleSpring, [0, 1], [60, 0])}px)`,
          color: "#FFFFFF",
          fontSize: 72,
          fontWeight: 800,
          textAlign: "center",
          wordBreak: "keep-all",
          lineHeight: 1.3,
          marginBottom: 90,
        }}
      >
        {title}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
        {steps.map((step, i) => {
          const appear = spring({
            frame: frame - 10 - i * STEP_STAGGER_FRAMES,
            fps,
            config: { damping: 200 },
          });
          // 등장 후 잠시 골드 하이라이트됐다가 다음 단계로 넘어가면 가라앉는다
          const highlightStart = 10 + i * STEP_STAGGER_FRAMES;
          const highlight = interpolate(
            frame,
            [highlightStart, highlightStart + 8, highlightStart + STEP_STAGGER_FRAMES + 10],
            [0, 1, i === steps.length - 1 ? 1 : 0.25],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div
                  style={{
                    width: 8,
                    height: 44,
                    margin: "0 auto",
                    borderRadius: 4,
                    background: BRAND.gold,
                    opacity: appear * 0.7,
                  }}
                />
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 36,
                  opacity: appear,
                  transform: `scale(${0.94 + 0.06 * highlight})`,
                  background: `rgba(245, 166, 35, ${0.08 + 0.14 * highlight})`,
                  border: `4px solid rgba(245, 166, 35, ${0.35 + 0.65 * highlight})`,
                  borderRadius: 28,
                  padding: "34px 40px",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 84,
                    height: 84,
                    borderRadius: "50%",
                    background: BRAND.gold,
                    color: BRAND.navy,
                    fontSize: 48,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{
                    color: "#FFFFFF",
                    fontSize: 50,
                    fontWeight: 600,
                    wordBreak: "keep-all",
                    lineHeight: 1.35,
                  }}
                >
                  {step}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
