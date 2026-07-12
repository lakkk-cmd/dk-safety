import { siteConfig } from "@/lib/site-config";
import { getSupabaseAdmin, usesSupabaseReservationsDb } from "@/lib/supabase-pg";

export type PaymentSettings = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  /** 온라인 예약 기본 출장비(할인가) */
  baseDispatchFee: number;
  /** 전화예약·현장즉시접수 기본 출장비(정가) */
  baseDispatchFeeOffline: number;
  /** 단순 기구교체(점검 없이 바로 교체) 정액 공임 */
  simpleSwapFee: number;
};

const fallbackSettings: PaymentSettings = {
  bankName: siteConfig.defaultBankName,
  accountNumber: siteConfig.defaultBankAccountNumber,
  accountHolder: siteConfig.defaultBankAccountHolder,
  baseDispatchFee: Number.isFinite(siteConfig.defaultDispatchFee) ? Math.max(50000, siteConfig.defaultDispatchFee) : 50000,
  baseDispatchFeeOffline: 200000,
  simpleSwapFee: 70000
};

export async function readPaymentSettings(): Promise<PaymentSettings> {
  const supabase = usesSupabaseReservationsDb() ? getSupabaseAdmin() : null;
  if (!supabase) {
    return fallbackSettings;
  }

  const readSingleApartmentSettings = async (): Promise<PaymentSettings | null> => {
    const { data: apartments } = await supabase
      .from("apartments")
      .select("bank_info, base_fee")
      .order("created_at", { ascending: true })
      .limit(2);
    if (!apartments || apartments.length !== 1) return null;
    const row = apartments[0] as {
      bank_info?: { bankName?: string; accountNumber?: string; accountHolder?: string } | null;
      base_fee?: number;
    };
    return {
      bankName: row.bank_info?.bankName || fallbackSettings.bankName,
      accountNumber: row.bank_info?.accountNumber || fallbackSettings.accountNumber,
      accountHolder: row.bank_info?.accountHolder || fallbackSettings.accountHolder,
      baseDispatchFee: Number.isFinite(row.base_fee) ? Math.max(50000, Number(row.base_fee)) : fallbackSettings.baseDispatchFee,
      baseDispatchFeeOffline: fallbackSettings.baseDispatchFeeOffline,
      simpleSwapFee: fallbackSettings.simpleSwapFee
    };
  };
  const { data, error } = await supabase
    .from("payment_settings")
    .select("bank_name, account_number, account_holder, base_dispatch_fee, base_dispatch_fee_offline, simple_swap_fee")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    const singleApartment = await readSingleApartmentSettings();
    return singleApartment ?? fallbackSettings;
  }

  const baseSettings: PaymentSettings = {
    bankName: data.bank_name || fallbackSettings.bankName,
    accountNumber: data.account_number || fallbackSettings.accountNumber,
    accountHolder: data.account_holder || fallbackSettings.accountHolder,
    baseDispatchFee: Number.isFinite(data.base_dispatch_fee) ? Math.max(50000, Number(data.base_dispatch_fee)) : fallbackSettings.baseDispatchFee,
    baseDispatchFeeOffline: Number.isFinite(data.base_dispatch_fee_offline)
      ? Math.max(50000, Number(data.base_dispatch_fee_offline))
      : fallbackSettings.baseDispatchFeeOffline,
    simpleSwapFee: Number.isFinite(data.simple_swap_fee) ? Math.max(10000, Number(data.simple_swap_fee)) : fallbackSettings.simpleSwapFee
  };
  const singleApartment = await readSingleApartmentSettings();
  return singleApartment
    ? { ...singleApartment, baseDispatchFeeOffline: baseSettings.baseDispatchFeeOffline, simpleSwapFee: baseSettings.simpleSwapFee }
    : baseSettings;
}

export async function updatePaymentSettings(input: Partial<PaymentSettings>): Promise<PaymentSettings> {
  const supabase = usesSupabaseReservationsDb() ? getSupabaseAdmin() : null;
  if (!supabase) {
    throw new Error("Supabase DB 모드에서만 수정할 수 있습니다.");
  }
  const current = await readPaymentSettings();
  const next: PaymentSettings = {
    bankName: input.bankName?.trim() || current.bankName,
    accountNumber: input.accountNumber?.trim() || current.accountNumber,
    accountHolder: input.accountHolder?.trim() || current.accountHolder,
    baseDispatchFee:
      typeof input.baseDispatchFee === "number" && Number.isFinite(input.baseDispatchFee)
        ? Math.max(50000, Math.round(input.baseDispatchFee))
        : current.baseDispatchFee,
    baseDispatchFeeOffline:
      typeof input.baseDispatchFeeOffline === "number" && Number.isFinite(input.baseDispatchFeeOffline)
        ? Math.max(50000, Math.round(input.baseDispatchFeeOffline))
        : current.baseDispatchFeeOffline,
    simpleSwapFee:
      typeof input.simpleSwapFee === "number" && Number.isFinite(input.simpleSwapFee)
        ? Math.max(10000, Math.round(input.simpleSwapFee))
        : current.simpleSwapFee
  };

  const { error } = await supabase.from("payment_settings").upsert({
    id: 1,
    bank_name: next.bankName,
    account_number: next.accountNumber,
    account_holder: next.accountHolder,
    base_dispatch_fee: next.baseDispatchFee,
    base_dispatch_fee_offline: next.baseDispatchFeeOffline,
    simple_swap_fee: next.simpleSwapFee,
    updated_at: new Date().toISOString()
  });
  if (error) {
    throw new Error(`입금 설정 저장 실패: ${error.message}`);
  }

  // pricing_catalog JSON의 base_dispatch 금액을 base_dispatch_fee 컬럼과 동일하게 유지
  const { data: psRow } = await supabase.from("payment_settings").select("pricing_catalog").eq("id", 1).maybeSingle();
  const catalogRaw = psRow?.pricing_catalog;
  if (Array.isArray(catalogRaw)) {
    const fee = Math.max(50000, Math.round(next.baseDispatchFee));
    let touched = false;
    const updated = catalogRaw.map((item: unknown) => {
      if (!item || typeof item !== "object") return item;
      const row = item as Record<string, unknown>;
      if (row.key === "base_dispatch") {
        touched = true;
        return { ...row, amount: fee };
      }
      return item;
    });
    if (touched) {
      await supabase
        .from("payment_settings")
        .update({ pricing_catalog: updated, updated_at: new Date().toISOString() })
        .eq("id", 1);
    }
  }

  return next;
}

