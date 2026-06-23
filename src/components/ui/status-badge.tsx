import * as React from "react";
import { cn } from "@/lib/utils";

export type RiskLevel = "안전" | "주의" | "경고" | "위험";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  level: RiskLevel;
  size?: "sm" | "md" | "lg";
}

const LEVEL_CLASS: Record<RiskLevel, string> = {
  안전: "bg-dk-green",
  주의: "bg-dk-gold",
  경고: "bg-dk-amber",
  위험: "bg-dk-red"
};

const LEVEL_ICON: Record<RiskLevel, string> = {
  안전: "✅",
  주의: "⚠️",
  경고: "🔶",
  위험: "🔴"
};

const SIZE_CLASS: Record<NonNullable<StatusBadgeProps["size"]>, string> = {
  sm: "gap-1 rounded-full px-2.5 py-1 text-xs",
  md: "gap-1.5 rounded-full px-3.5 py-1.5 text-sm",
  lg: "gap-2 rounded-2xl px-5 py-3 text-lg"
};

export function StatusBadge({ level, size = "md", className, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-bold text-white",
        LEVEL_CLASS[level],
        SIZE_CLASS[size],
        className
      )}
      {...props}
    >
      <span aria-hidden="true">{LEVEL_ICON[level]}</span>
      <span>{level}</span>
    </span>
  );
}
