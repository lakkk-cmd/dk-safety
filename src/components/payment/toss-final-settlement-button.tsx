"use client";

import { useState } from "react";
import { loadTossScript } from "@/lib/toss-sdk";

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
