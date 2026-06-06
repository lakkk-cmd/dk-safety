"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function PaymentSuccessClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("결제 승인 확인 중입니다...");
  const [done, setDone] = useState(false);
  const [warrantyNumber, setWarrantyNumber] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aptCode = searchParams.get("aptCode")?.trim() ?? "";
  const backUrl = aptCode ? `/apt/${aptCode}` : "/home";

  useEffect(() => {
    void (async () => {
      const paymentKey = searchParams.get("paymentKey")?.trim() ?? "";
      const orderId = searchParams.get("orderId")?.trim() ?? "";
      const amount = Number(searchParams.get("amount") ?? 0);
      const flow = (searchParams.get("flow")?.trim() ?? "").toLowerCase();
      if (!paymentKey || !orderId || !Number.isFinite(amount) || amount <= 0) {
        setMessage("결제 확인 정보가 올바르지 않습니다.");
        return;
      }
      try {
        const response = await fetch("/api/payments/toss/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentKey, orderId, amount })
        });
        const data = (await response.json()) as { message?: string };
        if (!response.ok) throw new Error(data.message ?? "결제 승인 실패");
        if (flow === "final") {
          const finalResponse = await fetch(`/api/orders/${encodeURIComponent(orderId)}/final-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "TOSS",
              paymentKey
            })
          });
          const finalData = (await finalResponse.json()) as { message?: string; result?: { warrantyNumber?: string } };
          if (!finalResponse.ok) throw new Error(finalData.message ?? "최종 정산 결제 처리 실패");
          setWarrantyNumber(finalData.result?.warrantyNumber ?? "");
          setMessage("안심 보증서가 발급되었습니다.");
          setDone(true);
          setCountdown(5);
          return;
        }
        setMessage("결제 승인 완료! Webhook으로 최종 상태를 동기화하고 있습니다.");
        setDone(true);
        setCountdown(5);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "결제 확인 실패");
      }
    })();
  }, [searchParams]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      router.push(backUrl);
      return;
    }
    timerRef.current = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [countdown, backUrl, router]);

  return (
    <main className="page-fit max-w-xl">
      <section className="surface-card rounded-2xl p-5">
        <h1 className="text-xl font-extrabold text-slate-900">결제 결과</h1>
        <p className="mt-3 text-sm text-slate-700">{message}</p>
        {done && countdown !== null ? (
          <p className="mt-1 text-xs text-slate-500">{countdown}초 후 자동으로 이동합니다.</p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Link href="/home" className="btn-outline px-4 py-2 text-sm">
            홈으로 이동
          </Link>
          {done ? (
            <Link href={backUrl} className="btn-primary px-4 py-2 text-sm">
              서비스 화면으로 이동
            </Link>
          ) : null}
        </div>
        {done && warrantyNumber ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a
              href={`/api/warranties/${encodeURIComponent(warrantyNumber)}/image`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 text-sm font-bold text-slate-800"
            >
              보증서 이미지
            </a>
            <a
              href={`/api/warranties/${encodeURIComponent(warrantyNumber)}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-dk-navy text-sm font-bold text-white"
            >
              보증서 PDF
            </a>
          </div>
        ) : null}
      </section>
    </main>
  );
}
