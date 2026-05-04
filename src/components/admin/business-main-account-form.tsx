"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type AccountFields = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export default function BusinessMainAccountForm() {
  const [form, setForm] = useState<AccountFields>({
    bankName: "",
    accountNumber: "",
    accountHolder: ""
  });
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoadingData(true);
      try {
        const response = await fetch("/api/admin/payment-settings", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          settings?: AccountFields & { baseDispatchFee?: number };
        };
        if (data.settings) {
          setForm({
            bankName: data.settings.bankName ?? "",
            accountNumber: data.settings.accountNumber ?? "",
            accountHolder: data.settings.accountHolder ?? ""
          });
        }
      } catch {
        // ignore
      } finally {
        setLoadingData(false);
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
        body: JSON.stringify({
          bankName: form.bankName.trim(),
          accountNumber: form.accountNumber.trim(),
          accountHolder: form.accountHolder.trim()
        })
      });
      const data = (await response.json()) as { settings?: AccountFields; message?: string };
      if (!response.ok || !data.settings) {
        throw new Error(data.message || "저장 실패");
      }
      setForm({
        bankName: data.settings.bankName,
        accountNumber: data.settings.accountNumber,
        accountHolder: data.settings.accountHolder
      });
      setMessage("사업자 주계좌가 저장되었습니다. 입금 안내에 즉시 반영됩니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200/90">사업자 주계좌</p>
          <h2 className="mt-1 text-lg font-black text-slate-900 dark:text-slate-50">입금 안내 계좌 변경</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            고객에게 노출되는 무통장 입금 계좌입니다. 계좌를 바꿀 때마다 여기서 수정하세요.
          </p>
        </div>
        <div className="relative z-10 mt-2 flex justify-end sm:mt-0">
          <Link
            href="/admin/base-dispatch-fee"
            className="inline-flex shrink-0 cursor-pointer items-center text-sm font-semibold text-[#0a5eb0] underline-offset-2 hover:underline dark:text-sky-400"
          >
            기본 출장비 설정 →
          </Link>
        </div>
      </div>

      <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={submit}>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">은행명</span>
          <input
            className="soft-input w-full text-sm dark:border-slate-600 dark:bg-slate-900"
            placeholder="예: 국민은행"
            value={form.bankName}
            onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}
            required
            disabled={loadingData}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">계좌번호</span>
          <input
            className="soft-input w-full font-mono text-sm dark:border-slate-600 dark:bg-slate-900"
            placeholder="숫자만 또는 하이픈 포함"
            value={form.accountNumber}
            onChange={(e) => setForm((p) => ({ ...p, accountNumber: e.target.value }))}
            required
            disabled={loadingData}
          />
        </label>
        <label className="block text-sm sm:col-span-3">
          <span className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">예금주</span>
          <input
            className="soft-input w-full text-sm dark:border-slate-600 dark:bg-slate-900"
            placeholder="사업자명 또는 법인명"
            value={form.accountHolder}
            onChange={(e) => setForm((p) => ({ ...p, accountHolder: e.target.value }))}
            required
            disabled={loadingData}
          />
        </label>

        {message ? (
          <p
            className={`text-sm sm:col-span-3 ${message.includes("실패") || message.includes("수정할 수") ? "text-rose-700 dark:text-rose-400" : "text-emerald-800 dark:text-emerald-300"}`}
          >
            {message}
          </p>
        ) : null}

        <div className="sm:col-span-3">
          <button type="submit" disabled={loading || loadingData} className="btn-primary px-6 py-2.5 text-sm disabled:opacity-60">
            {loading ? "저장 중..." : loadingData ? "불러오는 중..." : "주계좌 저장"}
          </button>
        </div>
      </form>
    </section>
  );
}
