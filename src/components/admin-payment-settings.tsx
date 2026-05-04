"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type AccountOnly = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export default function AdminPaymentSettings() {
  const [form, setForm] = useState<AccountOnly>({
    bankName: "",
    accountNumber: "",
    accountHolder: ""
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/payment-settings", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          settings?: AccountOnly & { baseDispatchFee?: number };
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
      const data = (await response.json()) as { settings?: AccountOnly; message?: string };
      if (!response.ok || !data.settings) {
        throw new Error(data.message || "저장 실패");
      }
      setForm({
        bankName: data.settings.bankName,
        accountNumber: data.settings.accountNumber,
        accountHolder: data.settings.accountHolder
      });
      setMessage("입금 안내 계좌가 저장되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="surface-card rounded-2xl border border-slate-200 p-5 dark:border-slate-700 dark:bg-slate-950">
      <p className="warranty-badge">PAYMENT CONFIG</p>
      <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-slate-50">입금 안내 계좌</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">고객에게 표시되는 무통장 입금 계좌입니다.</p>
      <form className="mt-4 space-y-2" onSubmit={submit}>
        <input
          className="soft-input w-full text-sm dark:border-slate-600 dark:bg-slate-900"
          placeholder="은행명"
          value={form.bankName}
          onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}
          required
        />
        <input
          className="soft-input w-full text-sm dark:border-slate-600 dark:bg-slate-900"
          placeholder="계좌번호"
          value={form.accountNumber}
          onChange={(e) => setForm((p) => ({ ...p, accountNumber: e.target.value }))}
          required
        />
        <input
          className="soft-input w-full text-sm dark:border-slate-600 dark:bg-slate-900"
          placeholder="예금주"
          value={form.accountHolder}
          onChange={(e) => setForm((p) => ({ ...p, accountHolder: e.target.value }))}
          required
        />
        {message ? <p className="text-xs text-slate-700 dark:text-slate-300">{message}</p> : null}
        <button type="submit" disabled={loading} className="btn-primary w-full py-2 text-sm disabled:opacity-60">
          {loading ? "저장 중..." : "입금 안내 저장"}
        </button>
      </form>
      <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-300">기본 출장비 금액</span>은{" "}
        <Link href="/admin/base-dispatch-fee" className="font-semibold text-[#0a5eb0] underline-offset-2 hover:underline dark:text-sky-400">
          기본 출장비 설정
        </Link>
        화면에서 수정합니다.
      </p>
    </section>
  );
}
