import { siteConfig } from "@/lib/site-config";
import { readPaymentSettings } from "@/lib/payment-settings";
import { getSupabaseAdmin, usesSupabaseReservationsDb } from "@/lib/supabase-pg";

export type PricingCatalogLine = {
  key: string;
  title: string;
  amount: number | null;
  detail: string;
};

const FALLBACK_BASE = Number.isFinite(siteConfig.defaultDispatchFee)
  ? Math.max(50000, siteConfig.defaultDispatchFee)
  : 50000;

export function defaultPricingCatalog(baseDispatchFee: number): PricingCatalogLine[] {
  const base = Math.max(50000, Math.round(baseDispatchFee));
  return [
    {
      key: "base_dispatch",
      title: "기본 출장점검",
      amount: base,
      detail: "방문 + 누전점검 + 차단기 확인 + 점검기록표"
    },
    {
      key: "full_package",
      title: "풀패키지",
      amount: 200000,
      detail: "기본 출장점검 + 절연저항 정밀측정 + 분전함 정밀점검 + 개선 리포트"
    },
    {
      key: "leakage",
      title: "누전 탐지/보수",
      amount: null,
      detail: "누전 지점 추적 및 선로 복구 · 난이도에 따라 상향 (최소 30만 시작)"
    },
    {
      key: "fixture_swap",
      title: "기구 교체 공임",
      amount: null,
      detail: "콘센트, 스위치 등 (자재비 별도) · 1개만 갈아도 최소 70,000원 발생"
    },
    {
      key: "breaker_swap",
      title: "차단기 교체",
      amount: null,
      detail: "노후 누전차단기 교체 (자재비 별도) · 안전 점검비 포함"
    },
    {
      key: "emergency_dispatch",
      title: "긴급/야간 출동",
      amount: 100000,
      detail: "당일 2시간 이내 또는 18시 이후 · 출장비 100% 할증 적용"
    }
  ];
}

function normalizeLines(lines: unknown): PricingCatalogLine[] | null {
  if (!Array.isArray(lines)) return null;
  const out: PricingCatalogLine[] = [];
  for (const row of lines) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key : "";
    const title = typeof r.title === "string" ? r.title : "";
    const detail = typeof r.detail === "string" ? r.detail : "";
    if (!key || !title) continue;
    let amount: number | null = null;
    if (r.amount === null || r.amount === undefined) {
      amount = null;
    } else if (typeof r.amount === "number" && Number.isFinite(r.amount)) {
      amount = Math.round(r.amount);
    } else {
      const n = Number(r.amount);
      amount = Number.isFinite(n) ? Math.round(n) : null;
    }
    out.push({ key, title, amount, detail });
  }
  return out.length ? out : null;
}

/** 금액 표시(VAT 별도 안내와 함께 쓰임). */
export function formatPricingCatalogFee(amount: number | null): string {
  if (amount === null) return "변동 · 견적";
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 읽기: base_dispatch 금액은 항상 DB 컬럼 base_dispatch_fee와 맞춥니다. */
export async function readPricingCatalog(): Promise<PricingCatalogLine[]> {
  const supabase = usesSupabaseReservationsDb() ? getSupabaseAdmin() : null;
  if (!supabase) {
    return defaultPricingCatalog(FALLBACK_BASE);
  }

  const { data, error } = await supabase
    .from("payment_settings")
    .select("base_dispatch_fee, pricing_catalog")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return defaultPricingCatalog(FALLBACK_BASE);
  }

  const baseFee = Number.isFinite(data.base_dispatch_fee)
    ? Math.max(50000, Number(data.base_dispatch_fee))
    : FALLBACK_BASE;

  const parsed = normalizeLines(data.pricing_catalog);
  if (!parsed) {
    return defaultPricingCatalog(baseFee);
  }

  return parsed.map((line) =>
    line.key === "base_dispatch" ? { ...line, amount: baseFee } : line
  );
}

const FALLBACK_EMERGENCY = 100000;

/** 긴급/야간 출동 예약금 — pricing_catalog의 `emergency_dispatch` 항목 금액을 실제 청구에 그대로 사용한다. */
export async function readEmergencyDispatchFee(): Promise<number> {
  const lines = await readPricingCatalog();
  const row = lines.find((line) => line.key === "emergency_dispatch");
  if (row && typeof row.amount === "number" && Number.isFinite(row.amount) && row.amount > 0) {
    return Math.round(row.amount);
  }
  return FALLBACK_EMERGENCY;
}

export async function updatePricingCatalog(lines: PricingCatalogLine[]): Promise<PricingCatalogLine[]> {
  const supabase = usesSupabaseReservationsDb() ? getSupabaseAdmin() : null;
  if (!supabase) {
    throw new Error("Supabase DB 모드에서만 요금/단가표를 저장할 수 있습니다.");
  }

  const sanitized: PricingCatalogLine[] = lines.map((line) => {
    const title = line.title?.trim() ?? "";
    const key = line.key?.trim() ?? "";
    const detail = line.detail?.trim() ?? "";
    let amount: number | null = null;
    if (line.amount === null || line.amount === undefined) {
      amount = null;
    } else {
      const n = Number(line.amount);
      amount = Number.isFinite(n) ? Math.round(n) : null;
    }
    if (key === "base_dispatch" && amount !== null) {
      amount = Math.max(50000, amount);
    }
    return { key, title, detail, amount };
  });

  const baseRow = sanitized.find((l) => l.key === "base_dispatch");
  if (
    baseRow &&
    (baseRow.amount === null || baseRow.amount === undefined || baseRow.amount < 50000)
  ) {
    throw new Error("기본 출장비는 50,000원 이상으로 입력해 주세요.");
  }
  const baseDispatchFee =
    baseRow?.amount !== null && baseRow?.amount !== undefined ? baseRow.amount : 50000;

  const pay = await readPaymentSettings();
  const { error } = await supabase.from("payment_settings").upsert({
    id: 1,
    bank_name: pay.bankName,
    account_number: pay.accountNumber,
    account_holder: pay.accountHolder,
    base_dispatch_fee: Math.max(50000, Math.round(baseDispatchFee)),
    pricing_catalog: sanitized,
    updated_at: new Date().toISOString()
  });

  if (error) {
    throw new Error(`요금/단가표 저장 실패: ${error.message}`);
  }

  return readPricingCatalog();
}
