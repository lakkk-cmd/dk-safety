import { Suspense } from "react";
import PaymentSuccessClient from "@/components/payment/payment-success-client";

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<main className="page-fit max-w-xl"><section className="surface-card rounded-2xl p-5 text-sm text-slate-600">결제 결과를 확인 중입니다...</section></main>}>
      <PaymentSuccessClient />
    </Suspense>
  );
}
