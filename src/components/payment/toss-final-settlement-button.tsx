"use client";

import { useState } from "react";

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      requestPayment: (method: string, payload: Record<string, unknown>) => Promise<void>;
    };
  }
}

const SCRIPT_ID = "toss-payments-sdk-v1";
const SCRIPT_SRC = "https://js.tosspayments.com/v1/payment";

// 모듈 스코프에 로딩 Promise를 캐싱 — React StrictMode가 effect/핸들러를 두 번
// 실행하거나 이 컴포넌트가 한 페이지에 여러 번 마운트돼도, 이미 있는 <script> 태그를
// "존재하니 완료됐다"고 오판하지 않고 실제 로드 완료(onload)까지 항상 같은 Promise로 기다린다.
let tossScriptPromise: Promise<void> | null = null;

function loadTossScript(): Promise<void> {
  if (typeof window !== "undefined" && window.TossPayments) return Promise.resolve();
  if (tossScriptPromise) return tossScriptPromise;
  tossScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("결제 SDK 로드 실패")));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("결제 SDK 로드 실패"));
    document.body.appendChild(script);
  });
  return tossScriptPromise;
}

type Props = {
  /** orders.id — 우리 DB의 영속적 주문 식별자. Toss orderId와는 별개(그건 매 시도마다 새로 발급) */
  dbOrderId: string;
  amount: number;
  orderName: string;
  customerName: string;
  customerMobilePhone: string;
  /** flow=final&reservationId=...&aptCode=... 까지 호출부가 완성해서 전달 — dbOrderId는 이 컴포넌트가 덧붙임 */
  successUrl: string;
  failUrl: string;
  onError?: (message: string) => void;
};

function appendDbOrderId(url: string, dbOrderId: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}dbOrderId=${encodeURIComponent(dbOrderId)}`;
}

export default function TossFinalSettlementButton({
  dbOrderId,
  amount,
  orderName,
  customerName,
  customerMobilePhone,
  successUrl,
  failUrl,
  onError
}: Props) {
  const [paying, setPaying] = useState(false);

  const pay = async () => {
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "";
    if (!clientKey) {
      onError?.("Toss 결제 키가 설정되지 않았습니다.");
      return;
    }
    setPaying(true);
    try {
      await loadTossScript();
      const tossFactory = window.TossPayments;
      if (!tossFactory) throw new Error("Toss SDK를 불러오지 못했습니다.");
      const toss = tossFactory(clientKey);
      // 매 결제 시도마다 새 orderId 발급 — Toss는 한 번 승인/취소된 orderId를 영구
      // 재사용 불가 처리하므로, orders.id(dbOrderId)를 그대로 쓰면 재시도가 영구히 막힌다.
      const tossOrderId = crypto.randomUUID();
      await toss.requestPayment("카드", {
        amount,
        orderId: tossOrderId,
        orderName,
        customerName,
        customerMobilePhone: customerMobilePhone.replace(/[^0-9]/g, ""),
        successUrl: appendDbOrderId(successUrl, dbOrderId),
        failUrl: appendDbOrderId(failUrl, dbOrderId)
      });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "결제 요청 실패");
    } finally {
      setPaying(false);
    }
  };

  return (
    <button
      type="button"
      disabled={paying}
      onClick={() => void pay()}
      className="mt-2 flex min-h-12 w-full items-center justify-center rounded-2xl bg-dk-blue px-5 text-base font-bold text-white disabled:opacity-60"
    >
      {paying ? "결제 진행 중..." : "카드로 결제하기"}
    </button>
  );
}
