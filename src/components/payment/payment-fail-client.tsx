"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function PaymentFailClient() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "-";
  const message = searchParams.get("message") ?? "결제가 취소되었거나 실패했습니다.";
  const aptCode = searchParams.get("aptCode")?.trim() ?? "";
  const backUrl = aptCode ? `/apt/${aptCode}` : "/home";

  return (
    <main className="page-fit max-w-xl">
      <section className="surface-card rounded-2xl p-5">
        <h1 className="text-xl font-extrabold text-slate-900">결제 실패</h1>
        <p className="mt-3 text-sm text-slate-700">{message}</p>
        <p className="mt-1 text-xs text-slate-500">코드: {code}</p>
        <div className="mt-4 flex gap-2">
          <Link href="/home" className="btn-outline px-4 py-2 text-sm">
            홈으로 이동
          </Link>
          {aptCode ? (
            <Link href={backUrl} className="btn-primary px-4 py-2 text-sm">
              다시 시도
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
