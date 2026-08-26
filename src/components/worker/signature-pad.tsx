"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  width?: number;
  height?: number;
  onChange: (dataUrl: string | null) => void;
};

export default function SignaturePad({ width = 320, height = 160, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const getCtx = () => canvasRef.current?.getContext("2d");

  const paintBackground = useCallback((ctx: CanvasRenderingContext2D, cssWidth: number, cssHeight: number) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  /**
   * `width`/`height` props는 캔버스의 "기본" 크기일 뿐, 실제 화면에서는 className의
   * `w-full`이 컨테이너 폭에 맞춰 캔버스를 늘린다. 캔버스의 내부 드로잉 버퍼(width/height
   * 속성)는 그대로 고정값(예: 320)인데 화면에는 그보다 넓게(예: 380px) 표시되면, 터치 좌표
   * (getBoundingClientRect 기준, 표시 크기 단위)를 그대로 드로잉 좌표로 써서 실제 잉크가
   * 찍히는 위치와 손가락 위치가 어긋난다(2026-08-26, 대표님 신고 — 세대점검 서명 시 터치위치
   * 불일치). 내부 버퍼 해상도를 실제 표시 크기(+devicePixelRatio, 고해상도 화면 선명도)에
   * 맞춰 동기화해서 근본적으로 고친다 — 이후 포인터 핸들러의 좌표계산은 그대로 CSS 픽셀
   * 기준으로 정확히 맞아떨어진다.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const syncCanvasResolution = () => {
      const rect = canvas.getBoundingClientRect();
      const cssWidth = rect.width || width;
      const cssHeight = rect.height || height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      paintBackground(ctx, cssWidth, cssHeight);
      setHasInk(false);
      onChange(null);
    };

    syncCanvasResolution();

    const observer = new ResizeObserver(() => syncCanvasResolution());
    observer.observe(canvas);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, width]);

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }, [onChange]);

  const start = (x: number, y: number) => {
    const ctx = getCtx();
    if (!ctx) return;
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (x: number, y: number) => {
    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
    emit();
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    paintBackground(ctx, rect.width || width, rect.height || height);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="touch-none w-full max-w-full rounded-xl border border-slate-200 bg-white"
        style={{ height }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const rect = e.currentTarget.getBoundingClientRect();
          start(e.clientX - rect.left, e.clientY - rect.top);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          move(e.clientX - rect.left, e.clientY - rect.top);
        }}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex justify-end">
        <button type="button" onClick={clear} className="text-xs font-semibold text-slate-600 underline">
          서명 지우기
        </button>
      </div>
      {!hasInk ? <p className="text-xs text-slate-500">손가락 또는 펜으로 서명해주세요.</p> : null}
    </div>
  );
}
