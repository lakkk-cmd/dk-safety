import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export type SubscriptionStatus = "inactive" | "active" | "past_due" | "cancelled";
export type SubscriptionBillingMethod = "toss_auto" | "bank_transfer";

/** 무료 PDF 다운로드 한도 — 30일 롤링 주기당 "점검건" 5건. 재다운로드는 카운트하지 않는다. */
export const FREE_PDF_QUOTA_PER_CYCLE = 5;
export const FREE_QUOTA_CYCLE_DAYS = 30;
const CYCLE_MS = FREE_QUOTA_CYCLE_DAYS * 24 * 60 * 60 * 1000;

/** 2026년 말까지 초기 확산을 위한 전면 무료배포 기간 — 이 시점 전엔 구독 여부/쿼터와 무관하게
 *  PDF 다운로드를 전부 허용한다. 언락 기록은 그대로 남기므로 이 기간에 받은 건은 2027년 이후에도
 *  already_unlocked 판정으로 계속 무료 재열람된다. */
export const FREE_LAUNCH_PROMO_UNTIL = new Date("2027-01-01T00:00:00+09:00");
export function isFreeLaunchPromoActive(): boolean {
  return Date.now() < FREE_LAUNCH_PROMO_UNTIL.getTime();
}

export type ApartmentSubscription = {
  id: string;
  apartmentId: string;
  status: SubscriptionStatus;
  billingMethod: SubscriptionBillingMethod | null;
  tossCustomerKey: string | null;
  tossBillingKey: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  lastPaymentAt: string | null;
  lastPaymentStatus: string | null;
  freeQuotaAnchorAt: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApartmentSubscriptionRow = {
  id: string;
  apartment_id: string;
  status: string;
  billing_method: string | null;
  toss_customer_key: string | null;
  toss_billing_key: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  last_payment_at: string | null;
  last_payment_status: string | null;
  free_quota_anchor_at: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapSubscription(row: ApartmentSubscriptionRow): ApartmentSubscription {
  return {
    id: row.id,
    apartmentId: row.apartment_id,
    status: (row.status as SubscriptionStatus) ?? "inactive",
    billingMethod: (row.billing_method as SubscriptionBillingMethod) ?? null,
    tossCustomerKey: row.toss_customer_key,
    tossBillingKey: row.toss_billing_key,
    currentPeriodEnd: row.current_period_end,
    nextBillingAt: row.next_billing_at,
    lastPaymentAt: row.last_payment_at,
    lastPaymentStatus: row.last_payment_status,
    freeQuotaAnchorAt: row.free_quota_anchor_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** 단지 총세대수 기준 월 구독료. 스냅샷하지 않고 매 청구 시점의 최신 total_units로 다시 계산한다.
 *  총세대수 미등록(null)이면 낮은 요금 쪽으로 처리한다 — 모르는 값으로 더 비싸게 청구하지 않는다. */
export function getSubscriptionTierPrice(totalUnits: number | null): number {
  if (totalUnits === null || !Number.isFinite(totalUnits) || totalUnits <= 300) return 30000;
  return 50000;
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function pgGetApartmentSubscription(apartmentId: string): Promise<ApartmentSubscription | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("apartment_subscriptions")
    .select("*")
    .eq("apartment_id", apartmentId)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw new Error(`구독 정보 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return mapSubscription(data as ApartmentSubscriptionRow);
}

/** 구독행이 없는 단지(마이그레이션 이전 승인분 등)를 만나면 만들어 준다 — anchor는 이 시점부터. */
export async function pgEnsureApartmentSubscription(apartmentId: string): Promise<ApartmentSubscription> {
  const existing = await pgGetApartmentSubscription(apartmentId);
  if (existing) return existing;
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from("apartment_subscriptions")
    .insert({ apartment_id: apartmentId })
    .select("id")
    .single();
  // 동시 요청이 겹쳐 unique 충돌(23505)이 나도 정상 — 아래에서 다시 읽으면 된다.
  if (error && error.code !== "23505") {
    throw new Error(`구독 정보 생성 실패: ${error.message}`);
  }
  const created = await pgGetApartmentSubscription(apartmentId);
  if (!created) throw new Error("구독 정보 생성 실패: 생성 직후 조회에 실패했습니다.");
  return created;
}

export async function pgListSubscriptionsByApartmentIds(
  apartmentIds: string[]
): Promise<Record<string, ApartmentSubscription>> {
  if (apartmentIds.length === 0) return {};
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("apartment_subscriptions").select("*").in("apartment_id", apartmentIds);
  if (error) {
    throw new Error(`구독 정보 목록 조회 실패: ${error.message}`);
  }
  const map: Record<string, ApartmentSubscription> = {};
  for (const row of (data ?? []) as ApartmentSubscriptionRow[]) {
    map[row.apartment_id] = mapSubscription(row);
  }
  return map;
}

/** 계좌이체 입금을 대표님이 확인했을 때의 수동 활성화 — 세금계산서 발행은 앱 밖(기존 방식) 처리다. */
export async function pgActivateSubscriptionManual(apartmentId: string): Promise<ApartmentSubscription> {
  await pgEnsureApartmentSubscription(apartmentId);
  const supabase = requireSupabaseAdmin();
  const now = new Date();
  const periodEnd = addDays(now, FREE_QUOTA_CYCLE_DAYS);
  const { data, error } = await supabase
    .from("apartment_subscriptions")
    .update({
      status: "active",
      billing_method: "bank_transfer",
      current_period_end: periodEnd.toISOString(),
      // 계좌이체는 자동청구 대상이 아니다 — 크론이 집어가지 않도록 next_billing_at을 비운다.
      next_billing_at: null,
      last_payment_at: now.toISOString(),
      last_payment_status: "bank_transfer_confirmed",
      cancelled_at: null,
      updated_at: now.toISOString()
    })
    .eq("apartment_id", apartmentId)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`구독 활성화 실패: ${error?.message ?? "unknown"}`);
  }
  return mapSubscription(data as ApartmentSubscriptionRow);
}

/**
 * 카드 등록창에 넘길 customerKey를 서버가 발급해 미리 저장한다. Toss 문서 권고대로 콜백에서
 * 리다이렉트로 돌아온 customerKey와 대조해, 다른 단지/외부에서 만든 값이 끼어드는 걸 막는다.
 * 이미 발급받은 단지는 같은 키를 재사용한다(한 단지 = 한 구매자).
 */
export async function pgIssueTossCustomerKey(apartmentId: string): Promise<string> {
  const existing = await pgEnsureApartmentSubscription(apartmentId);
  if (existing.tossCustomerKey) return existing.tossCustomerKey;

  // 영문/숫자/-_=.@만 허용, 2~50자 제약을 만족하면서 유추 불가능해야 한다(Toss 스펙).
  const customerKey = `apt-${crypto.randomUUID()}`;
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from("apartment_subscriptions")
    .update({ toss_customer_key: customerKey, updated_at: new Date().toISOString() })
    .eq("apartment_id", apartmentId);
  if (error) {
    throw new Error(`구매자 키 발급 실패: ${error.message}`);
  }
  return customerKey;
}

/** Toss 빌링키 발급 직후 저장 + 즉시 활성화. 첫 청구는 이번 주기가 끝나는 30일 뒤다. */
export async function pgSaveTossBillingKey(
  apartmentId: string,
  params: { customerKey: string; billingKey: string }
): Promise<ApartmentSubscription> {
  await pgEnsureApartmentSubscription(apartmentId);
  const supabase = requireSupabaseAdmin();
  const now = new Date();
  const periodEnd = addDays(now, FREE_QUOTA_CYCLE_DAYS);
  const { data, error } = await supabase
    .from("apartment_subscriptions")
    .update({
      status: "active",
      billing_method: "toss_auto",
      toss_customer_key: params.customerKey,
      toss_billing_key: params.billingKey,
      current_period_end: periodEnd.toISOString(),
      next_billing_at: periodEnd.toISOString(),
      cancelled_at: null,
      updated_at: now.toISOString()
    })
    .eq("apartment_id", apartmentId)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`빌링키 저장 실패: ${error?.message ?? "unknown"}`);
  }
  return mapSubscription(data as ApartmentSubscriptionRow);
}

/** 자동청구 크론 결과 반영 — 실패는 유예 없이 past_due(=PDF 즉시 잠금)로 떨어뜨린다. */
export async function pgRecordAutoChargeResult(
  apartmentId: string,
  result: { success: boolean; failReason?: string }
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const now = new Date();
  const patch: Record<string, unknown> = {
    last_payment_at: now.toISOString(),
    last_payment_status: result.success ? "paid" : (result.failReason ?? "failed").slice(0, 200),
    updated_at: now.toISOString()
  };
  if (result.success) {
    const periodEnd = addDays(now, FREE_QUOTA_CYCLE_DAYS);
    patch.status = "active";
    patch.current_period_end = periodEnd.toISOString();
    patch.next_billing_at = periodEnd.toISOString();
  } else {
    patch.status = "past_due";
    patch.next_billing_at = null;
  }
  const { error } = await supabase.from("apartment_subscriptions").update(patch).eq("apartment_id", apartmentId);
  if (error) {
    throw new Error(`결제 결과 저장 실패: ${error.message}`);
  }
}

/** 해지 — current_period_end까지는 계속 활성으로 두고, 그 이후 크론이 만료 처리한다(즉시 차단 아님). */
export async function pgCancelSubscription(apartmentId: string): Promise<ApartmentSubscription> {
  const supabase = requireSupabaseAdmin();
  const now = new Date();
  const { data, error } = await supabase
    .from("apartment_subscriptions")
    .update({
      cancelled_at: now.toISOString(),
      next_billing_at: null,
      updated_at: now.toISOString()
    })
    .eq("apartment_id", apartmentId)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`구독 해지 실패: ${error?.message ?? "unknown"}`);
  }
  return mapSubscription(data as ApartmentSubscriptionRow);
}

/** 해지 후 기간이 끝난 구독을 만료시킨다(자동청구 크론이 매일 함께 돌린다). */
export async function pgExpireEndedCancellations(): Promise<number> {
  const supabase = requireSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("apartment_subscriptions")
    .update({ status: "cancelled", updated_at: nowIso })
    .eq("status", "active")
    .not("cancelled_at", "is", null)
    .lte("current_period_end", nowIso)
    .select("id");
  if (error) {
    throw new Error(`해지 만료 처리 실패: ${error.message}`);
  }
  return (data ?? []).length;
}

/** 오늘 청구해야 할 toss_auto 구독 목록 — 해지된 건은 next_billing_at이 이미 비워져 있어 제외된다. */
export async function pgListSubscriptionsDueForCharge(): Promise<ApartmentSubscription[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("apartment_subscriptions")
    .select("*")
    .eq("billing_method", "toss_auto")
    .eq("status", "active")
    .not("next_billing_at", "is", null)
    .lte("next_billing_at", new Date().toISOString());
  if (error) {
    throw new Error(`자동청구 대상 조회 실패: ${error.message}`);
  }
  return ((data ?? []) as ApartmentSubscriptionRow[]).map(mapSubscription);
}

export type PdfQuotaStatus = {
  subscribed: boolean;
  status: SubscriptionStatus;
  usedThisCycle: number;
  remainingFree: number;
  cycleResetAt: string;
  /** true면 2026년 말까지 전면 무료배포 기간 — 구독/쿼터 표시를 UI에서 무시해야 한다. */
  promoActive: boolean;
  promoUntil: string;
};

/** anchor로부터 30일씩 끊었을 때 지금이 속한 주기의 시작/끝. */
function currentCycleWindow(anchorIso: string): { start: Date; end: Date } {
  const anchor = new Date(anchorIso);
  const elapsed = Date.now() - anchor.getTime();
  const cycleIndex = elapsed > 0 ? Math.floor(elapsed / CYCLE_MS) : 0;
  const start = new Date(anchor.getTime() + cycleIndex * CYCLE_MS);
  return { start, end: new Date(start.getTime() + CYCLE_MS) };
}

async function countUnlocksInCycle(apartmentId: string, since: Date): Promise<number> {
  const supabase = requireSupabaseAdmin();
  const { count, error } = await supabase
    .from("apartment_pdf_downloads")
    .select("id", { count: "exact", head: true })
    .eq("apartment_id", apartmentId)
    .gte("downloaded_at", since.toISOString());
  if (error) {
    throw new Error(`무료 다운로드 사용량 조회 실패: ${error.message}`);
  }
  return count ?? 0;
}

/** 화면 표시용 조회 — 아무것도 소비하지 않는다. */
export async function pgGetPdfQuotaStatus(apartmentId: string): Promise<PdfQuotaStatus> {
  const subscription = await pgEnsureApartmentSubscription(apartmentId);
  const { start, end } = currentCycleWindow(subscription.freeQuotaAnchorAt);
  const used = await countUnlocksInCycle(apartmentId, start);
  return {
    subscribed: subscription.status === "active",
    status: subscription.status,
    usedThisCycle: used,
    remainingFree: Math.max(0, FREE_PDF_QUOTA_PER_CYCLE - used),
    cycleResetAt: end.toISOString(),
    promoActive: isFreeLaunchPromoActive(),
    promoUntil: FREE_LAUNCH_PROMO_UNTIL.toISOString()
  };
}

export type PdfQuotaDecision = {
  allowed: boolean;
  /** subscribed=구독중 무제한 / already_unlocked=이미 받은 건(영구 무료) / free_quota=무료 한도 차감 /
   *  exhausted=한도 소진 / promo_free=2026년 말까지 전면 무료배포 기간 */
  reason: "subscribed" | "already_unlocked" | "free_quota" | "exhausted" | "promo_free";
  remainingFree: number;
  cycleResetAt: string;
};

/**
 * PDF 다운로드 게이트. 허용되면 apartment_pdf_downloads에 언락 기록을 남긴다(이미 있으면 그대로).
 * 카운트 단위는 "점검건"이라 같은 건의 재다운로드는 몇 번이든 무료다.
 */
export async function pgCheckAndConsumePdfQuota(
  apartmentId: string,
  unitInspectionId: string,
  aptManagerId: string
): Promise<PdfQuotaDecision> {
  const supabase = requireSupabaseAdmin();
  const subscription = await pgEnsureApartmentSubscription(apartmentId);
  const { start, end } = currentCycleWindow(subscription.freeQuotaAnchorAt);
  const cycleResetAt = end.toISOString();

  const { data: existing, error: existingError } = await supabase
    .from("apartment_pdf_downloads")
    .select("id")
    .eq("apartment_id", apartmentId)
    .eq("unit_inspection_id", unitInspectionId)
    .maybeSingle();
  if (existingError) {
    throw new Error(`다운로드 이력 조회 실패: ${existingError.message}`);
  }

  if (isFreeLaunchPromoActive()) {
    // 언락 기록은 그대로 남긴다 — 2027년 이후 already_unlocked 판정의 근거가 된다.
    if (!existing) await insertUnlock(apartmentId, unitInspectionId, aptManagerId);
    return { allowed: true, reason: "promo_free", remainingFree: FREE_PDF_QUOTA_PER_CYCLE, cycleResetAt };
  }

  if (subscription.status === "active") {
    // 구독중이어도 언락 기록은 남긴다 — 나중에 해지해도 이미 받은 건은 계속 무료여야 하고,
    // 그 판단 근거가 바로 이 행이다.
    if (!existing) await insertUnlock(apartmentId, unitInspectionId, aptManagerId);
    const used = await countUnlocksInCycle(apartmentId, start);
    return {
      allowed: true,
      reason: "subscribed",
      remainingFree: Math.max(0, FREE_PDF_QUOTA_PER_CYCLE - used),
      cycleResetAt
    };
  }

  if (existing) {
    const used = await countUnlocksInCycle(apartmentId, start);
    return {
      allowed: true,
      reason: "already_unlocked",
      remainingFree: Math.max(0, FREE_PDF_QUOTA_PER_CYCLE - used),
      cycleResetAt
    };
  }

  const used = await countUnlocksInCycle(apartmentId, start);
  if (used >= FREE_PDF_QUOTA_PER_CYCLE) {
    return { allowed: false, reason: "exhausted", remainingFree: 0, cycleResetAt };
  }

  await insertUnlock(apartmentId, unitInspectionId, aptManagerId);
  return {
    allowed: true,
    reason: "free_quota",
    remainingFree: Math.max(0, FREE_PDF_QUOTA_PER_CYCLE - (used + 1)),
    cycleResetAt
  };
}

/**
 * 일괄 zip용 배치 버전. 항목마다 `pgCheckAndConsumePdfQuota`를 부르면 건당 3~4회 왕복이라
 * 단지 전체(수백 세대)를 묶을 때 크론/함수 시간제한에 걸린다 — 이력을 한 번만 읽고 메모리에서
 * 판정한 뒤 새 언락만 한 번에 insert한다. 판정 규칙은 단건 버전과 동일하다.
 */
export async function pgCheckAndConsumePdfQuotaBulk(
  apartmentId: string,
  unitInspectionIds: string[],
  aptManagerId: string
): Promise<{ allowedIds: string[]; skippedCount: number }> {
  const supabase = requireSupabaseAdmin();
  const subscription = await pgEnsureApartmentSubscription(apartmentId);
  const { start } = currentCycleWindow(subscription.freeQuotaAnchorAt);

  const { data, error } = await supabase
    .from("apartment_pdf_downloads")
    .select("unit_inspection_id, downloaded_at")
    .eq("apartment_id", apartmentId);
  if (error) {
    throw new Error(`다운로드 이력 조회 실패: ${error.message}`);
  }
  const history = (data ?? []) as { unit_inspection_id: string; downloaded_at: string }[];
  // 언락은 주기와 무관하게 영구 유효하고(재다운로드 무료), 한도 차감은 이번 주기 건만 센다.
  const unlockedIds = new Set(history.map((row) => row.unit_inspection_id));
  const usedThisCycle = history.filter((row) => new Date(row.downloaded_at) >= start).length;

  const allowedIds: string[] = [];
  const newIds: string[] = [];
  let skippedCount = 0;

  if (isFreeLaunchPromoActive() || subscription.status === "active") {
    for (const id of unitInspectionIds) {
      allowedIds.push(id);
      if (!unlockedIds.has(id)) newIds.push(id);
    }
  } else {
    let budget = FREE_PDF_QUOTA_PER_CYCLE - usedThisCycle;
    for (const id of unitInspectionIds) {
      if (unlockedIds.has(id)) {
        allowedIds.push(id);
      } else if (budget > 0) {
        allowedIds.push(id);
        newIds.push(id);
        budget -= 1;
      } else {
        skippedCount += 1;
      }
    }
  }

  if (newIds.length > 0) {
    const { error: insertError } = await supabase.from("apartment_pdf_downloads").upsert(
      newIds.map((id) => ({
        apartment_id: apartmentId,
        unit_inspection_id: id,
        apt_manager_id: aptManagerId
      })),
      { onConflict: "apartment_id,unit_inspection_id", ignoreDuplicates: true }
    );
    if (insertError) {
      throw new Error(`다운로드 이력 저장 실패: ${insertError.message}`);
    }
  }

  return { allowedIds, skippedCount };
}

async function insertUnlock(apartmentId: string, unitInspectionId: string, aptManagerId: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from("apartment_pdf_downloads").insert({
    apartment_id: apartmentId,
    unit_inspection_id: unitInspectionId,
    apt_manager_id: aptManagerId
  });
  // 23505 = 동시 요청이 같은 건을 동시에 언락한 경우. 이미 언락된 것과 결과가 같으므로 무시한다.
  if (error && error.code !== "23505") {
    throw new Error(`다운로드 이력 저장 실패: ${error.message}`);
  }
}
