"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** SWOT/TOWS 수동 재생성 버튼 — 분기 자동 크론과 별개로 언제든 즉시 재생성할 수 있게 한다.
 *  실제 Claude API 호출(1~2분 소요)이라 눌렀을 때 명확한 로딩 표시가 필요하다. */
export default function SwotRegenerateButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/swot", { method: "POST" });
      const json = (await res.json()) as { message?: string };
      if (!res.ok) {
        setMessage(json.message ?? "생성 실패");
        return;
      }
      router.refresh();
    } catch {
      setMessage("생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className="rounded-xl bg-cc-navy px-4 py-2 text-sm font-bold text-white hover:bg-cc-navy/90 disabled:opacity-50"
      >
        {loading ? "분석 중… (1~2분)" : "🔄 지금 재생성"}
      </button>
      {message ? <p className="text-xs font-semibold text-cc-red">{message}</p> : null}
    </div>
  );
}
