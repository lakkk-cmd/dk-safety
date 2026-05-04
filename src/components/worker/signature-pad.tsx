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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    onChange(null);
  }, [height, onChange, width]);

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
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="touch-none w-full max-w-full rounded-xl border border-slate-200 bg-white"
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
