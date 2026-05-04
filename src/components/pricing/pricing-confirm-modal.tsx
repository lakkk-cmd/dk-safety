"use client";

import { calculatePricing, type PricingGuideKey, pricingGuideNotice } from "@/lib/pricing-guide";

type Props = {
  open: boolean;
  title: string;
  confirmLabel: string;
  selectedItemKeys: PricingGuideKey[];
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
};

export default function PricingConfirmModal({
  open,
  title,
  confirmLabel,
  selectedItemKeys,
  onConfirm,
  onClose,
  loading = false
}: Props) {
  if (!open) return null;
  const pricing = calculatePricing(selectedItemKeys);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.35)]">
        <h4 className="text-lg font-extrabold text-slate-900">{title}</h4>
        <p className="mt-1 text-sm text-slate-600">요금 안내를 확인하고 최종 동의하면 요청이 접수됩니다.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {pricing.appliedItems.map((item) => (
            <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="text-sm font-bold text-primary">{item.fee}</p>
              <p className="mt-1 text-[11px] text-slate-600">{item.detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold text-blue-800">산출된 최종요금</p>
          <p className="mt-1 text-lg font-extrabold text-blue-900">{pricing.totalLabel}</p>
          <p className="mt-1 text-[11px] text-blue-700">추가공사내용에 따라 금액은 추가될 수 있습니다.</p>
          {pricing.hasVariablePrice ? (
            <p className="mt-1 text-[11px] text-blue-700">교체비는 부품/작업 범위에 따라 현장에서 추가 안내됩니다.</p>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-slate-500">{pricingGuideNotice}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline px-4 py-2 text-sm" disabled={loading}>
            취소
          </button>
          <button type="button" onClick={onConfirm} className="btn-primary px-4 py-2 text-sm disabled:opacity-60" disabled={loading}>
            {loading ? "처리 중..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
