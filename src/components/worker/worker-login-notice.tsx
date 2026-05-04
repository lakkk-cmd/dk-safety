"use client";

import { useSearchParams } from "next/navigation";

export default function WorkerLoginNotice() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  if (reason !== "db") {
    return null;
  }
  return (
    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      Supabase DB 모드(<code className="font-mono">DK_SAFETY_USE_SUPABASE_DB</code>)가 켜져 있어야 기사 앱을 사용할 수 있습니다.
    </p>
  );
}
