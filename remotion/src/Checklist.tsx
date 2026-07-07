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

export type ChecklistProps = {
  title: string;
  items: string[];
};

const ITEM_STAGGER_FRAMES = 14;

const CheckMark: React.FC<{ progress: number }> = ({ progress }) => (
  <svg width={72} height={72} viewBox="0 0 72 72">
    <circle
      cx={36}
      cy={36}
      r={32}
      fill={BRAND.green}
      opacity={progress}
      transform={`scale(${0.6 + 0.4 * progress})`}
      style={{ transformOrigin: "36px 36px" }}
    />
    <path
      d="M20 38 L31 49 L52 26"
      stroke="#FFFFFF"
      strokeWidth={8}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      strokeDasharray={60}
      strokeDashoffset={60 * (1 - progress)}
    />
  </svg>
);

export const Checklist: React.FC<ChecklistProps> = ({ title, items }) => {
  ensurePretendard();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 20%, #14345C 0%, ${BRAND.navy} 70%)`,
        fontFamily: FONT_FAMILY,
        padding: "160px 80px",
      }}
    >
      <div
        style={{
          opacity: titleSpring,
          transform: `translateY(${interpolate(titleSpring, [0, 1], [60, 0])}px)`,
          color: BRAND.gold,
          fontSize: 76,
          fontWeight: 800,
          textAlign: "center",
          wordBreak: "keep-all",
          lineHeight: 1.3,
          marginBottom: 100,
        }}
      >
        {title}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
        {items.map((item, i) => {
          const itemSpring = spring({
            frame: frame - 12 - i * ITEM_STAGGER_FRAMES,
            fps,
            config: { damping: 16, mass: 0.7 },
          });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 36,
                opacity: itemSpring,
                transform: `translateX(${interpolate(itemSpring, [0, 1], [80, 0])}px)`,
                background: "rgba(255,255,255,0.06)",
                borderRadius: 24,
                padding: "32px 40px",
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <CheckMark progress={Math.min(1, itemSpring)} />
              </div>
              <div
                style={{
                  color: "#FFFFFF",
                  fontSize: 52,
                  fontWeight: 600,
                  wordBreak: "keep-all",
                  lineHeight: 1.35,
                }}
              >
                {item}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
