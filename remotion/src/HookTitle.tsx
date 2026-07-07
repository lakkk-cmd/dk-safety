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

export type HookTitleProps = {
  title: string;
  subtitle: string;
  iconType: "warning" | "check";
};

const WarningIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <path
      d="M50 8 L96 88 L4 88 Z"
      fill={BRAND.gold}
      stroke={BRAND.navy}
      strokeWidth={4}
      strokeLinejoin="round"
    />
    <rect x={45} y={36} width={10} height={30} rx={5} fill={BRAND.navy} />
    <circle cx={50} cy={76} r={6} fill={BRAND.navy} />
  </svg>
);

const CheckIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx={50} cy={50} r={46} fill={BRAND.green} />
    <path
      d="M28 52 L44 68 L74 34"
      stroke="#FFFFFF"
      strokeWidth={12}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export const HookTitle: React.FC<HookTitleProps> = ({
  title,
  subtitle,
  iconType,
}) => {
  ensurePretendard();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 아이콘: 등장 스프링 + 이후 계속 펄스
  const iconIn = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const pulse = 1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2 * 1.6);
  const iconScale = iconIn * pulse;

  // 타이포: 아래에서 스프링 등장 (아이콘보다 살짝 늦게, 부제는 그 다음)
  const titleSpring = spring({
    frame: frame - 6,
    fps,
    config: { damping: 200 },
  });
  const titleY = interpolate(titleSpring, [0, 1], [140, 0]);

  const subtitleSpring = spring({
    frame: frame - 14,
    fps,
    config: { damping: 200 },
  });
  const subtitleY = interpolate(subtitleSpring, [0, 1], [100, 0]);

  const barWidth = interpolate(
    spring({ frame: frame - 20, fps, config: { damping: 200 } }),
    [0, 1],
    [0, 320]
  );

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 30%, #14345C 0%, ${BRAND.navy} 65%)`,
        fontFamily: FONT_FAMILY,
        alignItems: "center",
        justifyContent: "center",
        padding: "0 80px",
      }}
    >
      <div
        style={{
          transform: `scale(${iconScale})`,
          marginBottom: 90,
        }}
      >
        {iconType === "warning" ? (
          <WarningIcon size={260} />
        ) : (
          <CheckIcon size={260} />
        )}
      </div>

      <div
        style={{
          opacity: titleSpring,
          transform: `translateY(${titleY}px)`,
          color: "#FFFFFF",
          fontSize: 104,
          fontWeight: 800,
          lineHeight: 1.25,
          textAlign: "center",
          wordBreak: "keep-all",
        }}
      >
        {title}
      </div>

      <div
        style={{
          width: barWidth,
          height: 10,
          borderRadius: 5,
          background: BRAND.gold,
          margin: "56px 0",
        }}
      />

      <div
        style={{
          opacity: subtitleSpring,
          transform: `translateY(${subtitleY}px)`,
          color: BRAND.gold,
          fontSize: 52,
          fontWeight: 600,
          textAlign: "center",
          wordBreak: "keep-all",
        }}
      >
        {subtitle}
      </div>
    </AbsoluteFill>
  );
};
