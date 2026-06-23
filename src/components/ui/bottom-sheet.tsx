"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-dk-navy/50"
      />
      <div
        className={cn(
          "relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(11,31,58,0.25)]",
          "animate-[bottom-sheet-in_0.22s_ease-out]",
          className
        )}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
        {title ? <h2 className="mb-3 text-lg font-bold text-dk-navy">{title}</h2> : null}
        {children}
      </div>
      <style>{`
        @keyframes bottom-sheet-in {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
