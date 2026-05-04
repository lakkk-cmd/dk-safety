"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function LiveNotificationToast({ role, workerId, phoneDigits }: Props) {
  const [latestItem, setLatestItem] = useState<LiveRow | null>(null);
  const normalizedPhone = useMemo(() => (phoneDigits ?? "").replaceAll(/[^0-9]/g, ""), [phoneDigits]);

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
  }, [role, workerId, normalizedPhone]);

  if (!latestItem) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[120] w-[min(92vw,360px)]">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
        <p className="flex items-center gap-2 text-xs font-black text-slate-800">
          <Bell className="h-4 w-4" />
          {latestItem.title}
        </p>
        <p className="mt-1 text-sm text-slate-700">{latestItem.message}</p>
      </div>
    </div>
  );
}
