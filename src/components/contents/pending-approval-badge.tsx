"use client";

import { useEffect, useState } from "react";

type PendingCounts = { youtube?: number; kakao?: number; blog?: number };

export default function PendingApprovalBadge() {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/api/admin/content/overview", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { pending?: PendingCounts };
        const pending = json.pending ?? {};
        const sum = (pending.youtube ?? 0) + (pending.kakao ?? 0) + (pending.blog ?? 0);
        if (active) setTotal(sum);
      } catch {
        // 배지는 보조 정보이므로 실패 시 조용히 무시
      }
    };

    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!total || total <= 0) return null;

  return (
    <a
      href="#pending-queue"
      className="mt-4 inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800 ring-1 ring-amber-300 transition hover:bg-amber-200"
    >
      승인 대기 {total}건
    </a>
  );
}
