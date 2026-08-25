"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

type LiveRow = {
  id: string;
  role: "admin" | "worker" | "resident";
  title: string;
  message: string;
  target_worker_id: string | null;
  target_phone: string | null;
  reservation_id: string | null;
  created_at: string;
};

type Props = {
  role: "admin" | "worker" | "resident";
  workerId?: string;
  phoneDigits?: string;
};

const PERMISSION_DISMISSED_KEY = "dk_admin_notif_permission_dismissed";

/** 짧은 "삐" 알림음 — 오디오 파일을 따로 관리할 필요 없이 Web Audio API로 즉석 생성한다. */
function playBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => void ctx.close();
  } catch {
    // 오디오 재생 실패는 무시 — 알림 자체는 토스트로 이미 보여준다
  }
}

export default function LiveNotificationToast({ role, workerId, phoneDigits }: Props) {
  const [latestItem, setLatestItem] = useState<LiveRow | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [permissionBannerDismissed, setPermissionBannerDismissed] = useState(true);
  const normalizedPhone = useMemo(() => (phoneDigits ?? "").replaceAll(/[^0-9]/g, ""), [phoneDigits]);

  const originalTitleRef = useRef<string>("");
  const blinkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (role !== "admin") return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
    setPermissionBannerDismissed(window.localStorage.getItem(PERMISSION_DISMISSED_KEY) === "1");
  }, [role]);

  const requestPermission = async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch {
      // ignore
    }
  };

  const dismissPermissionBanner = () => {
    setPermissionBannerDismissed(true);
    window.localStorage.setItem(PERMISSION_DISMISSED_KEY, "1");
  };

  // 탭이 백그라운드일 때 새 알림이 오면 제목을 깜빡여서 눈치채게 한다 — 탭이 다시 보이면 멈춘다.
  const startTitleBlink = (message: string) => {
    if (typeof document === "undefined") return;
    if (!document.hidden) return;
    if (!originalTitleRef.current) originalTitleRef.current = document.title;
    if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current);
    let toggled = false;
    blinkIntervalRef.current = setInterval(() => {
      document.title = toggled ? originalTitleRef.current : `🔔 ${message}`;
      toggled = !toggled;
    }, 1200);
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    const stopBlink = () => {
      if (document.hidden) return;
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
        blinkIntervalRef.current = null;
      }
      if (originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
    };
    document.addEventListener("visibilitychange", stopBlink);
    return () => document.removeEventListener("visibilitychange", stopBlink);
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      const supabase = createBrowserSupabase();
      const channel = supabase
        .channel(`live-notify-${role}-${workerId ?? "any"}-${normalizedPhone || "any"}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "live_notifications", filter: `role=eq.${role}` },
          (payload) => {
            const row = payload.new as LiveRow;
            if (role === "worker" && workerId && row.target_worker_id && row.target_worker_id !== workerId) return;
            if (role === "resident" && normalizedPhone && row.target_phone && row.target_phone !== normalizedPhone) return;
            setLatestItem(row);
            if (role === "admin") {
              playBeep();
              startTitleBlink(row.title);
            }
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              void new Notification(row.title, { body: row.message });
            }
          }
        )
        .subscribe();
      unsubscribe = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // ignore realtime setup failure
    }
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, workerId, normalizedPhone]);

  const showPermissionBanner = role === "admin" && permission === "default" && !permissionBannerDismissed;

  return (
    <div className="fixed bottom-4 right-4 z-[120] flex w-[min(92vw,360px)] flex-col gap-2">
      {showPermissionBanner ? (
        <div className="rounded-2xl border border-dk-blue/30 bg-white p-3 shadow-xl">
          <p className="text-xs font-black text-slate-800">🔔 새 예약을 데스크톱 알림으로도 받을까요?</p>
          <p className="mt-1 text-[13px] text-slate-600">이 페이지를 안 보고 있어도 윈도우 알림으로 바로 알 수 있어요.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void requestPermission()}
              className="rounded-lg bg-dk-blue px-3 py-1.5 text-xs font-bold text-white"
            >
              알림 허용
            </button>
            <button type="button" onClick={dismissPermissionBanner} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600">
              나중에
            </button>
          </div>
        </div>
      ) : null}
      {latestItem ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="flex items-center gap-2 text-xs font-black text-slate-800">
            <Bell className="h-4 w-4" />
            {latestItem.title}
          </p>
          <p className="mt-1 text-sm text-slate-700">{latestItem.message}</p>
        </div>
      ) : null}
    </div>
  );
}
