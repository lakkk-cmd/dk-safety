export type PricingGuideItem = {
  key:
    | "base_dispatch"
    | "diagnosis"
    | "leakage"
    | "fixture_swap"
    | "breaker_swap"
    | "emergency_dispatch";
  title: string;
  fee: string;
  amount: number | null;
  detail: string;
};

/** 공개 요금 카드·산출용. 금액은 VAT 별도 기준 안내입니다. */
export const pricingGuideItems: PricingGuideItem[] = [
  {
    key: "base_dispatch",
    title: "기본 출장비",
    fee: "50,000원",
    amount: 50000,
    detail: "현장 방문, 육안 점검 및 기술 상담 · 모든 서비스의 공통 기본료"
  },
  {
    key: "diagnosis",
    title: "정밀 안전진단",
    fee: "150,000원",
    amount: 150000,
    detail: "분전반 수치 측정 및 열화상 진단 · 출장비 포함 (기술료 10만 원 추가)"
  },
  {
    key: "leakage",
    title: "누전 탐지/보수",
    fee: "300,000원 ~",
    amount: null,
    detail: "누전 지점 추적 및 선로 복구 · 난이도에 따라 상향 (최소 30만 시작)"
  },
  {
    key: "fixture_swap",
    title: "기구 교체 공임",
    fee: "기본 50,000원 + 개당 20,000원",
    amount: null,
    detail: "콘센트, 스위치 등 (자재비 별도) · 1개만 갈아도 최소 70,000원 발생"
  },
  {
    key: "breaker_swap",
    title: "차단기 교체",
    fee: "기본 50,000원 + 개당 40,000원",
    amount: null,
    detail: "노후 차단기 교체 (자재비 별도) · 안전 점검비 포함"
  },
  {
    key: "emergency_dispatch",
    title: "긴급/야간 출동",
    fee: "기본 출장비 100,000원",
    amount: 100000,
    detail: "당일 2시간 이내 또는 18시 이후 · 출장비 100% 할증 적용"
  }
];

export const pricingGuideNotice =
  "상기 금액은 VAT 별도이며, 현장 상태·부품 사양·작업 범위에 따라 변동될 수 있습니다.";

export type PricingGuideKey = PricingGuideItem["key"];

export function formatKrw(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function resolvePricingItems(keys: PricingGuideKey[]): PricingGuideItem[] {
  const keySet = new Set(keys);
  return pricingGuideItems.filter((item) => keySet.has(item.key));
}

export function calculatePricing(keys: PricingGuideKey[]) {
  const appliedItems = resolvePricingItems(keys);
  const total = appliedItems.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const hasVariablePrice = appliedItems.some((item) => item.amount === null);
  return {
    appliedItems,
    total,
    hasVariablePrice,
    totalLabel: hasVariablePrice ? `${formatKrw(total)} + 변동비` : formatKrw(total)
  };
}
