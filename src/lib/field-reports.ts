import { getKstDateTime } from "@/lib/agent-schedule";
import { pgListTasksForWorker } from "@/lib/reservations-pg";
import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export const BREAKER_VISUAL_STATUS_OPTIONS = ["정상", "과열흔적", "소손", "교체필요"] as const;
export const GROUNDING_STATUS_OPTIONS = ["정상", "불량", "미확인"] as const;
export const RISK_LEVEL_OPTIONS = ["안전", "주의", "경고", "위험"] as const;
export const URGENT_PART_OPTIONS = ["차단기", "콘센트", "배선", "접지단자", "기타"] as const;

export type BreakerVisualStatus = (typeof BREAKER_VISUAL_STATUS_OPTIONS)[number];
export type GroundingStatus = (typeof GROUNDING_STATUS_OPTIONS)[number];
export type RiskLevel = (typeof RISK_LEVEL_OPTIONS)[number];
export type UrgentPart = (typeof URGENT_PART_OPTIONS)[number];

export type FieldReportInput = {
  reservationId: string;
  apartmentAddress: string;
  breakerTripCurrentMa: number | null;
  mainBreakerCapacityA: number | null;
  insulationResistanceMohm: number | null;
  leakageDetected: boolean;
  leakagePathNote: string;
  breakerYear: number | null;
  breakerVisualStatus: BreakerVisualStatus | null;
  unitAreaSqm: number | null;
  outletOverheat: boolean;
  outletOverheatNote: string;
  wiringDamage: boolean;
  wiringDamageNote: string;
  groundingStatus: GroundingStatus | null;
  riskLevel: RiskLevel | null;
  urgentParts: UrgentPart[];
  siteMemo: string;
  photoUrls: string[];
  status: "draft" | "submitted" | "opinion_generated" | "pdf_generated" | "completed";
};

export type FieldReportSendResult = {
  resident: import("@/lib/field-report-notification").SendChannelResult | null;
  landlord: import("@/lib/field-report-notification").SendChannelResult | null;
};

export type FieldReport = FieldReportInput & {
  id: string;
  workerId: string | null;
  inspectedAt: string;
  opinionLandlord: string | null;
  opinionResident: string | null;
  opinionGeneratedAt: string | null;
  pdfLandlordUrl: string | null;
  pdfResidentUrl: string | null;
  pdfGeneratedAt: string | null;
  sendResult: FieldReportSendResult | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type FieldReportRow = {
  id: string;
  reservation_id: string;
  worker_id: string | null;
  apartment_address: string;
  inspected_at: string;
  breaker_trip_current_ma: number | null;
  main_breaker_capacity_a: number | null;
  insulation_resistance_mohm: number | null;
  leakage_detected: boolean;
  leakage_path_note: string;
  breaker_year: number | null;
  breaker_visual_status: string | null;
  unit_area_sqm: number | null;
  outlet_overheat: boolean;
  outlet_overheat_note: string;
  wiring_damage: boolean;
  wiring_damage_note: string;
  grounding_status: string | null;
  risk_level: string | null;
  urgent_parts: unknown;
  site_memo: string;
  photo_urls: unknown;
  status: string;
  opinion_landlord: string | null;
  opinion_resident: string | null;
  opinion_generated_at: string | null;
  pdf_landlord_url: string | null;
  pdf_resident_url: string | null;
  pdf_generated_at: string | null;
  send_result: unknown;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function mapFieldReport(row: FieldReportRow): FieldReport {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    workerId: row.worker_id,
    apartmentAddress: row.apartment_address,
    inspectedAt: row.inspected_at,
    breakerTripCurrentMa: row.breaker_trip_current_ma,
    mainBreakerCapacityA: row.main_breaker_capacity_a,
    insulationResistanceMohm: row.insulation_resistance_mohm,
    leakageDetected: row.leakage_detected,
    leakagePathNote: row.leakage_path_note,
    breakerYear: row.breaker_year,
    breakerVisualStatus: (row.breaker_visual_status as BreakerVisualStatus | null) ?? null,
    unitAreaSqm: row.unit_area_sqm,
    outletOverheat: row.outlet_overheat,
    outletOverheatNote: row.outlet_overheat_note,
    wiringDamage: row.wiring_damage,
    wiringDamageNote: row.wiring_damage_note,
    groundingStatus: (row.grounding_status as GroundingStatus | null) ?? null,
    riskLevel: (row.risk_level as RiskLevel | null) ?? null,
    urgentParts: asStringArray(row.urgent_parts) as UrgentPart[],
    siteMemo: row.site_memo,
    photoUrls: asStringArray(row.photo_urls),
    status: row.status as "draft" | "submitted" | "opinion_generated" | "pdf_generated" | "completed",
    opinionLandlord: row.opinion_landlord,
    opinionResident: row.opinion_resident,
    opinionGeneratedAt: row.opinion_generated_at,
    pdfLandlordUrl: row.pdf_landlord_url,
    pdfResidentUrl: row.pdf_resident_url,
    pdfGeneratedAt: row.pdf_generated_at,
    sendResult: (row.send_result as FieldReportSendResult | null) ?? null,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** 기사에게 배정된 작업 중 오늘(KST) 희망일자인 예약만 — 입력 화면 드롭다운용 */
export async function pgListTodayReservationsForWorker(workerId: string) {
  const todayKey = getKstDateTime().dateKey;
  const tasks = await pgListTasksForWorker(workerId);
  return tasks.filter((row) => row.reservation.preferredDate === todayKey);
}

export async function pgCreateFieldReport(workerId: string, input: FieldReportInput): Promise<FieldReport> {
  const supabase = requireSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("field_reports")
    .insert({
      reservation_id: input.reservationId,
      worker_id: workerId,
      apartment_address: input.apartmentAddress.trim(),
      inspected_at: nowIso,
      breaker_trip_current_ma: input.breakerTripCurrentMa,
      main_breaker_capacity_a: input.mainBreakerCapacityA,
      insulation_resistance_mohm: input.insulationResistanceMohm,
      leakage_detected: input.leakageDetected,
      leakage_path_note: input.leakagePathNote.trim(),
      breaker_year: input.breakerYear,
      breaker_visual_status: input.breakerVisualStatus,
      unit_area_sqm: input.unitAreaSqm,
      outlet_overheat: input.outletOverheat,
      outlet_overheat_note: input.outletOverheatNote.trim(),
      wiring_damage: input.wiringDamage,
      wiring_damage_note: input.wiringDamageNote.trim(),
      grounding_status: input.groundingStatus,
      risk_level: input.riskLevel,
      urgent_parts: input.urgentParts,
      site_memo: input.siteMemo.trim(),
      photo_urls: input.photoUrls,
      status: input.status,
      updated_at: nowIso
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`현장 점검 기록 저장 실패: ${error?.message ?? "unknown"}`);
  }
  // 새로고침/네트워크 끊김에도 견적 단계로 안전하게 복귀할 수 있도록, 생성 즉시 해당 예약의
  // task에 연결한다. 이미 연결된 task는 건드리지 않는다(멱등 — 동일 예약에 점검을 다시 만들어도
  // 최초 링크가 유지됨).
  await supabase.from("tasks").update({ field_report_id: data.id }).eq("reservation_id", input.reservationId).is("field_report_id", null);
  return mapFieldReport(data as FieldReportRow);
}

export async function pgGetFieldReportForWorker(id: string, workerId: string): Promise<FieldReport | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("field_reports").select("*").eq("id", id).maybeSingle();
  if (error) {
    throw new Error(`현장 점검 기록 조회 실패: ${error.message}`);
  }
  if (!data || data.worker_id !== workerId) {
    return null;
  }
  return mapFieldReport(data as FieldReportRow);
}

/** 고객용 공개 조회 — workerId 검증 없이 id만으로 조회 (검증서 페이지 `/verify/[id]`와 동일한 노출 모델) */
export async function pgGetFieldReportPublic(id: string): Promise<FieldReport | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("field_reports").select("*").eq("id", id).maybeSingle();
  if (error) {
    // 22P02 = Postgres invalid_text_representation — id가 UUID 형식이 아닐 때(오타·봇 스캔 등)
    // 발생한다. 이런 경우도 "찾을 수 없음"으로 취급해야 공개 페이지가 500이 아니라 404를 낸다.
    if (error.code === "22P02") return null;
    throw new Error(`현장 점검 기록 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return mapFieldReport(data as FieldReportRow);
}

/** 최근 현장 점검 사진들 — 영상 제작용 미디어 보관함에서 재업로드 없이 골라 쓰기 위한 목록 */
export type FieldReportPhoto = {
  reportId: string;
  apartmentAddress: string;
  inspectedAt: string;
  photoUrl: string;
};

export async function pgListRecentFieldReportPhotos(limit = 40): Promise<FieldReportPhoto[]> {
  const supabase = requireSupabaseAdmin();
  // photo_urls가 jsonb라 PostgREST 쪽에서 "빈 배열 아님"을 안정적으로 필터링하기 어려워,
  // 최근 리포트를 넉넉히 가져온 뒤 사진이 있는 것만 JS에서 골라낸다.
  const { data, error } = await supabase
    .from("field_reports")
    .select("id, apartment_address, inspected_at, photo_urls")
    .order("inspected_at", { ascending: false })
    .limit(200);
  if (error) {
    throw new Error(`현장 사진 목록 조회 실패: ${error.message}`);
  }
  const photos: FieldReportPhoto[] = [];
  for (const row of (data ?? []) as { id: string; apartment_address: string; inspected_at: string; photo_urls: unknown }[]) {
    for (const url of asStringArray(row.photo_urls)) {
      photos.push({ reportId: row.id, apartmentAddress: row.apartment_address, inspectedAt: row.inspected_at, photoUrl: url });
      if (photos.length >= limit) return photos;
    }
  }
  return photos;
}

/** 예약에 연결된 현장 점검 기록 — `/status` 페이지에서 "리포트 보기" 링크 노출 여부 판단용 */
export async function pgFindFieldReportByReservationId(reservationId: string): Promise<{ id: string; status: string } | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("field_reports")
    .select("id, status")
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`현장 점검 기록 조회 실패: ${error.message}`);
  }
  return data ? { id: data.id as string, status: data.status as string } : null;
}

export async function pgSaveFieldReportOpinion(
  id: string,
  opinion: { landlord: string; resident: string }
): Promise<FieldReport> {
  const supabase = requireSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("field_reports")
    .update({
      opinion_landlord: opinion.landlord,
      opinion_resident: opinion.resident,
      opinion_generated_at: nowIso,
      status: "opinion_generated",
      updated_at: nowIso
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`AI 소견 저장 실패: ${error?.message ?? "unknown"}`);
  }
  return mapFieldReport(data as FieldReportRow);
}

export async function pgSaveFieldReportPdf(
  id: string,
  pdf: { landlordUrl: string; residentUrl: string }
): Promise<FieldReport> {
  const supabase = requireSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("field_reports")
    .update({
      pdf_landlord_url: pdf.landlordUrl,
      pdf_resident_url: pdf.residentUrl,
      pdf_generated_at: nowIso,
      status: "pdf_generated",
      updated_at: nowIso
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`PDF 저장 실패: ${error?.message ?? "unknown"}`);
  }
  return mapFieldReport(data as FieldReportRow);
}

export async function pgSaveFieldReportSendResult(id: string, sendResult: FieldReportSendResult): Promise<FieldReport> {
  const supabase = requireSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("field_reports")
    .update({
      send_result: sendResult,
      sent_at: nowIso,
      status: "completed",
      updated_at: nowIso
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`발송 결과 저장 실패: ${error?.message ?? "unknown"}`);
  }
  return mapFieldReport(data as FieldReportRow);
}
