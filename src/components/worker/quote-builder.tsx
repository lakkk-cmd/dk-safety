"use client";

import { useEffect, useState } from "react";

export const CUSTOM_LABOR_TIER_ID = "__custom__";

export type MaterialCatalogItem = { id: string; name: string; unit_price: number };
export type LaborTierCatalogItem = { id: string; label: string; max_minutes: number; amount: number };

export type QuoteMaterial = { id: string; name: string; qty: number; unitPrice: number };
export type QuoteLaborTier = { label: string; amount: number } | null;

export type QuoteValue = {
  materials: QuoteMaterial[];
  laborTier: QuoteLaborTier;
  total: number;
};

/**
 * 재료비 다중선택 + 작업비 난이도 단일선택 UI. 견적 산출 단계(quote)와 작업완료 단계
 * 양쪽에서 재사용한다 — 완료 단계에서는 초기값을 견적 단계에서 저장한 값으로 프리필해
 * "최초 견적" 대비 조정 여부를 그대로 이어받을 수 있게 한다.
 */
export default function QuoteBuilder({
  catalogMaterials,
  catalogLaborTiers,
  initialMaterials,
  initialLaborTier,
  onChange
}: {
  catalogMaterials: MaterialCatalogItem[];
  catalogLaborTiers: LaborTierCatalogItem[];
  initialMaterials?: QuoteMaterial[] | null;
  initialLaborTier?: QuoteLaborTier;
  onChange: (value: QuoteValue) => void;
}) {
  const [materialQtys, setMaterialQtys] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const m of initialMaterials ?? []) init[m.id] = m.qty;
    return init;
  });
  const initialTierMatch = initialLaborTier
    ? (catalogLaborTiers.find((t) => t.label === initialLaborTier.label && t.amount === initialLaborTier.amount)?.id ?? CUSTOM_LABOR_TIER_ID)
    : null;
  const [selectedLaborTierId, setSelectedLaborTierId] = useState<string | null>(initialTierMatch);
  const [customLaborAmount, setCustomLaborAmount] = useState(
    initialTierMatch === CUSTOM_LABOR_TIER_ID ? String(initialLaborTier?.amount ?? 0) : "0"
  );
  const [customLaborReason, setCustomLaborReason] = useState("");

  const selectedMaterials: QuoteMaterial[] = catalogMaterials
    .filter((m) => (materialQtys[m.id] ?? 0) > 0)
    .map((m) => ({ id: m.id, name: m.name, qty: materialQtys[m.id] ?? 0, unitPrice: m.unit_price }));
  const materialsTotal = selectedMaterials.reduce((sum, m) => sum + m.qty * m.unitPrice, 0);
  const selectedTier = catalogLaborTiers.find((t) => t.id === selectedLaborTierId) ?? null;
  const isCustomLaborTier = selectedLaborTierId === CUSTOM_LABOR_TIER_ID;
  const laborAmount = isCustomLaborTier ? Math.max(0, Math.round(Number(customLaborAmount || "0"))) : (selectedTier?.amount ?? 0);
  const laborTierPayload: QuoteLaborTier =
    isCustomLaborTier && laborAmount > 0
      ? { label: `3시간 초과${customLaborReason.trim() ? ` (${customLaborReason.trim()})` : " (기사 재량)"}`, amount: laborAmount }
      : selectedTier
        ? { label: selectedTier.label, amount: selectedTier.amount }
        : null;
  const total = materialsTotal + laborAmount;

  useEffect(() => {
    onChange({ materials: selectedMaterials, laborTier: laborTierPayload, total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialQtys, selectedLaborTierId, customLaborAmount, customLaborReason]);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-slate-800">재료비 (해당 품목 수량 입력)</p>
        {catalogMaterials.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">등록된 재료 카탈로그가 없습니다.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {catalogMaterials.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5">
                <span className="text-xs font-semibold text-slate-800">
                  {m.name} <span className="text-slate-500">({m.unit_price.toLocaleString()}원)</span>
                </span>
                <input
                  type="number"
                  min={0}
                  value={materialQtys[m.id] ?? 0}
                  onChange={(e) => {
                    const qty = Math.max(0, Math.round(Number(e.target.value.replaceAll(/[^0-9]/g, "") || "0")));
                    setMaterialQtys((prev) => ({ ...prev, [m.id]: qty }));
                  }}
                  className="soft-input h-9 w-16 text-center text-sm"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-800">작업비 난이도 (해당 없으면 미선택)</p>
        <div className="mt-2 space-y-1.5">
          <button
            type="button"
            onClick={() => setSelectedLaborTierId(null)}
            className={`w-full rounded-lg border-2 px-2.5 py-2 text-left text-xs font-bold ${
              selectedLaborTierId === null ? "border-slate-400 bg-white" : "border-slate-200 bg-white/60 text-slate-600"
            }`}
          >
            작업비 없음 (재료비만)
          </button>
          {catalogLaborTiers.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedLaborTierId(t.id)}
              className={`w-full rounded-lg border-2 px-2.5 py-2 text-left text-xs font-bold ${
                selectedLaborTierId === t.id ? "border-dk-gold bg-amber-100 text-amber-900" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {t.label} — {t.amount.toLocaleString()}원
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedLaborTierId(CUSTOM_LABOR_TIER_ID)}
            className={`w-full rounded-lg border-2 px-2.5 py-2 text-left text-xs font-bold ${
              isCustomLaborTier ? "border-dk-gold bg-amber-100 text-amber-900" : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            3시간 초과 (기사 재량 · 직접 입력)
          </button>
          {isCustomLaborTier ? (
            <div className="space-y-1.5 rounded-lg bg-white p-2">
              <input
                type="text"
                value={customLaborReason}
                onChange={(e) => setCustomLaborReason(e.target.value)}
                placeholder="사유 (예: 배선 전면 교체)"
                className="soft-input w-full text-xs"
              />
              <input
                type="number"
                min={0}
                value={customLaborAmount}
                onChange={(e) => setCustomLaborAmount(e.target.value.replaceAll(/[^0-9]/g, "") || "0")}
                placeholder="작업비(원)"
                className="soft-input w-full text-xs"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
