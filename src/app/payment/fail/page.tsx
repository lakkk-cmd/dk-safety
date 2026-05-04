import { Suspense } from "react";
import PaymentFailClient from "@/components/payment/payment-fail-client";

export default function PaymentFailPage() {
  return (
    <Suspense fallback={<main className="page-fit max-w-xl"><section className="surface-card rounded-2xl p-5 text-sm text-slate-600">결제 실패 정보를 불러오는 중입니다...</section></main>}>
      <PaymentFailClient />
    </Suspense>
  );
}
