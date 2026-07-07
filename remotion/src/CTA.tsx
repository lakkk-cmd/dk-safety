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

export type CTAProps = {
  headline: string;
  subtitle: string;
};

export const CTA: React.FC<CTAProps> = ({ headline, subtitle }) => {
  ensurePretendard();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headSpring = spring({ frame, fps, config: { damping: 200 } });
  const subSpring = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const btnSpring = spring({
    frame: frame - 16,
    fps,
    config: { damping: 12, mass: 0.6 },
  });
  const pulse = 1 + 0.05 * Math.sin((frame / fps) * Math.PI * 2 * 1.4);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 35%, #14345C 0%, ${BRAND.navy} 70%)`,
        fontFamily: FONT_FAMILY,
        alignItems: "center",
        justifyContent: "center",
        padding: "0 80px",
      }}
    >
      <div
        style={{
          opacity: headSpring,
          transform: `translateY(${interpolate(headSpring, [0, 1], [80, 0])}px)`,
          color: "#FFFFFF",
          fontSize: 88,
          fontWeight: 800,
          textAlign: "center",
          wordBreak: "keep-all",
          lineHeight: 1.3,
        }}
      >
        {headline}
      </div>

      <div
        style={{
          opacity: subSpring,
          transform: `translateY(${interpolate(subSpring, [0, 1], [60, 0])}px)`,
          color: BRAND.sky,
          fontSize: 48,
          fontWeight: 500,
          textAlign: "center",
          wordBreak: "keep-all",
          lineHeight: 1.4,
          margin: "48px 0 90px",
        }}
      >
        {subtitle}
      </div>

      <div
        style={{
          transform: `scale(${btnSpring * pulse})`,
          background: BRAND.red,
          color: "#FFFFFF",
          fontSize: 54,
          fontWeight: 800,
          borderRadius: 60,
          padding: "34px 80px",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <svg width={64} height={64} viewBox="0 0 64 64">
          <rect x={4} y={12} width={56} height={40} rx={12} fill="#FFFFFF" />
          <path d="M27 24 L43 32 L27 40 Z" fill={BRAND.red} />
        </svg>
        구독하기
      </div>

      <div
        style={{
          opacity: btnSpring,
          marginTop: 80,
          color: BRAND.gold,
          fontSize: 42,
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        우리집 전기주치의 · dkansim.com
      </div>
    </AbsoluteFill>
  );
};
