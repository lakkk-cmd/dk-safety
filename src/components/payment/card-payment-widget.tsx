"use client";

type Props = {
  disabled?: boolean;
  loading?: boolean;
  onRequestPayment: () => void;
};

export default function CardPaymentWidget({ disabled = false, loading = false, onRequestPayment }: Props) {
  return (
    <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
      <p className="text-xs font-bold text-indigo-700">카드 결제 위젯</p>
      <p className="mt-1 text-sm text-slate-700">결제 위젯을 열어 50,000원 예약금을 결제합니다.</p>
      <button
        type="button"
        onClick={onRequestPayment}
        disabled={disabled || loading}
        className="mt-3 h-14 w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-2 text-[clamp(14px,4.6vw,28px)] leading-none font-extrabold tracking-[-0.01em] whitespace-nowrap text-white disabled:opacity-50"
      >
        {loading ? "결제 위젯 준비 중..." : "50,000원 결제하고 기사님 부르기"}
      </button>
    </div>
  );
}
