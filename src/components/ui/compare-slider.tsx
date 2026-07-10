"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CompareSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt: string;
  afterAlt: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

/**
 * 점검 전/후 사진 드래그 비교 슬라이더. After 레이어를 clip-path로 잘라내는 방식이라
 * 리사이즈에도 어긋나지 않고, 포인터 캡처 + 키보드(방향키) 조작을 모두 지원한다.
 * Supabase Storage 원격 URL을 다루므로 next/image가 아닌 일반 img 태그를 쓴다
 * (next.config.ts의 remotePatterns에 Supabase 도메인이 없음).
 */
export function CompareSlider({
  beforeSrc,
  afterSrc,
  beforeAlt,
  afterAlt,
  beforeLabel = "점검 전",
  afterLabel = "점검 후",
  className,
}: CompareSliderProps) {
  const [pos, setPos] = React.useState(50);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  const moveTo = React.useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, ratio)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") {
      setPos((p) => Math.max(0, p - step));
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      setPos((p) => Math.min(100, p + step));
      e.preventDefault();
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-2xl border border-slate-200 bg-dk-gray shadow-[0_4px_16px_rgba(11,31,58,0.08)]",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => draggingRef.current && moveTo(e.clientX)}
      onPointerUp={() => (draggingRef.current = false)}
      onPointerCancel={() => (draggingRef.current = false)}
    >
      {/* Before */}
      {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 원격 URL, next.config remotePatterns 미등록 */}
      <img src={beforeSrc} alt={beforeAlt} draggable={false} className="absolute inset-0 h-full w-full cursor-ew-resize object-cover" />
      <span className="absolute bottom-3 right-3 rounded-md bg-dk-navy/75 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
        {beforeLabel}
      </span>

      {/* After — clip-path로 좌측 pos%만 노출 */}
      <div className="absolute inset-0 cursor-ew-resize" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 원격 URL, next.config remotePatterns 미등록 */}
        <img src={afterSrc} alt={afterAlt} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        <span className="absolute bottom-3 left-3 rounded-md bg-dk-gold px-2.5 py-1 text-[11px] font-bold text-white">
          {afterLabel}
        </span>
      </div>

      {/* 핸들 */}
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(11,31,58,0.4)]" style={{ left: `${pos}%` }}>
        <button
          type="button"
          role="slider"
          aria-label="점검 전/후 비교 슬라이더"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          onKeyDown={onKeyDown}
          className="pointer-events-auto absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-slate-200 bg-white text-dk-navy shadow-[0_4px_12px_rgba(11,31,58,0.25)] transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-dk-blue group-hover:scale-110"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M4 3L1 7l3 4M10 3l3 4-3 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
