"use client";

import type { ReactNode } from "react";
import LiveNotificationToast from "@/components/live/live-notification-toast";

export default function WorkerChrome({ children, workerId }: { children: ReactNode; workerId: string }) {
  const logout = async () => {
    await fetch("/api/worker/logout", { method: "POST" });
    window.location.href = "/worker/login";
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-28">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <p className="text-sm font-black text-slate-900">현장 작업</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            로그아웃
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-lg px-4 py-4">{children}</div>
      <LiveNotificationToast role="worker" workerId={workerId} />
    </div>
  );
}
