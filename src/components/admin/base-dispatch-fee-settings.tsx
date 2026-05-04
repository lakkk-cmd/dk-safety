"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const MIN_FEE = 50000;

export default function BaseDispatchFeeSettings() {
  const [baseDispatchFee, setBaseDispatchFee] = useState(MIN_FEE);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/payment-settings", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { settings?: { baseDispatchFee?: number } };
        if (data.settings?.baseDispatchFee != null) {
          setBaseDispatchFee(Math.max(MIN_FEE, Number(data.settings.baseDispatchFee)));
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/payment-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseDispatchFee: Math.max(MIN_FEE, Math.round(baseDispatchFee)) })
      });
      const data = (await response.json()) as { settings?: { baseDispatchFee?: number }; message?: string };
      if (!response.ok || !data.settings) {
        throw new Error(data.message || "저장 실패");
      }
      setBaseDispatchFee(Math.max(MIN_FEE, Number(data.settings.baseDispatchFee)));
      setMessage("기본 출장비가 저장되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="surface-card rounded-2xl border border-slate-200 p-5 dark:border-slate-700 dark:bg-slate-950">
      <p className="warranty-badge">BASE DISPATCH FEE</p>
      <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-slate-50">기본 출장비</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        예약 시 안내되는 최소 출장비(예약금)입니다. 단지별 기본료와 함께 쓰이며, 변경 시 신규 예약부터 적용됩니다.
      </p>
      <form className="mt-4 space-y-3" onSubmit={submit}>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
          금액 (원)
          <input
            className="soft-input mt-1 w-full text-sm dark:border-slate-600 dark:bg-slate-900"
            type="number"
            min={MIN_FEE}
            step={1000}
            value={baseDispatchFee}
            onChange={(e) => setBaseDispatchFee(Math.max(MIN_FEE, Number(e.target.value || 0)))}
            required
          />
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">최소 {MIN_FEE.toLocaleString("ko-KR")}원 이상입니다.</p>
        {message ? (
          <p
            className={`text-sm ${message.includes("실패") || message.includes("수정할 수") ? "text-rose-700 dark:text-rose-400" : "text-emerald-800 dark:text-emerald-300"}`}
          >
            {message}
          </p>
        ) : null}
        <button type="submit" disabled={loading} className="btn-primary w-full py-2 text-sm disabled:opacity-60">
          {loading ? "저장 중..." : "기본 출장비 저장"}
        </button>
      </form>
      <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
        무통장 입금 계좌(은행·계좌번호)는{" "}
        <Link href="/admin/payment-settings" className="font-semibold text-[#0a5eb0] underline-offset-2 hover:underline dark:text-sky-400">
          결제 계좌 설정
        </Link>
        에서 수정합니다.
      </p>
    </section>
  );
}
