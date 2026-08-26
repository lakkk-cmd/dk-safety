import { requireSupabaseAdmin } from "@/lib/supabase-pg";
import {
  checkCompanyServiceLifeAdvisories,
  diagnoseChecklist,
  reissueWithFixedWording,
  type ChecklistEntry,
  type CompanyAdvisoryEntry,
  type DiagnosisEntry
} from "@/lib/unit-inspection-rules";

export type UnitInspectionType = "visit" | "unvisited_simple";

/**
 * dong/ho는 워커·전기과장이 자유 텍스트로 입력하는 값이라(예: "상가1호"처럼 한글·괄호·기호가
 * 섞일 수 있음) Supabase Storage 오브젝트 키에 그대로 넣으면 InvalidKey로 업로드가 실패할
 * 수 있다(2026-08-26, AI 안전진단 사후보정 정정본 PDF 업로드 테스트 중 실제로 재현·발견 —
 * 처음엔 괄호만 걸렀는데도 한글이 섞이면 여전히 InvalidKey가 나서, Supabase Storage 키는
 * 비ASCII 자체를 거부한다는 걸 확인했다). PDF 파일명에 쓸 때는 항상 이 함수로 한 번 걸러서
 * ASCII 영문/숫자/하이픈/언더스코어만 남긴다 — 실제 운영에서 dong/ho는 항상 숫자라 정상
 * 케이스는 영향 없다.
 */
export function sanitizeStoragePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

export type UnitInspectionInput = {
  apartmentId: string;
  dong: string;
  ho: string;
  inspectionType: UnitInspectionType;
  checklistItems: ChecklistEntry[];
  loadCurrent: number | null;
  igr: number | null;
  insulationResistance: number | null;
  etcNotes: string;
  /** 세대방문점검만 필수 — 미방문 간이점검은 전부 null */
  residentName: string | null;
  signatureData: string | null;
  residentPhone: string | null;
  /** 회사 자체 교체주기(10년) 안내 계산용 — 워커가 알 때만 입력하는 선택값 */
  outletInstallYear: number | null;
  switchInstallYear: number | null;
};

/** 이 건을 누가 입력했는지 — 대경 직원(dk_worker) 또는 전기과장 본인(apt_manager, 무료앱)(109). */
export type UnitInspectionActor =
  | { type: "dk_worker"; workerId: string }
  | { type: "apt_manager"; aptManagerId: string };

export type UnitInspection = UnitInspectionInput & {
  id: string;
  inspectorWorkerId: string | null;
  inputActorType: "dk_worker" | "apt_manager";
  aptManagerId: string | null;
  inspectedAt: string;
  autoDiagnosis: DiagnosisEntry[];
  /** 법적 근거 아님 — 별표3 규칙엔진(autoDiagnosis)과 분리해서 저장·표시한다 */
  companyAdvisories: CompanyAdvisoryEntry[];
  pdfUrl: string | null;
  createdAt: string;
};

type UnitInspectionRow = {
  id: string;
  apartment_id: string;
  dong: string;
  ho: string;
  inspection_type: string;
  inspector_worker_id: string | null;
  input_actor_type: string;
  apt_manager_id: string | null;
  inspected_at: string;
  checklist_items: unknown;
  load_current: number | null;
  igr: number | null;
  insulation_resistance: number | null;
  etc_notes: string;
  auto_diagnosis: unknown;
  resident_name: string | null;
  signature_data: string | null;
  resident_phone: string | null;
  outlet_install_year: number | null;
  switch_install_year: number | null;
  company_advisories: unknown;
  pdf_url: string | null;
  created_at: string;
};

function mapUnitInspection(row: UnitInspectionRow): UnitInspection {
  const checklistItems = (Array.isArray(row.checklist_items) ? row.checklist_items : []) as ChecklistEntry[];
  const autoDiagnosis = (Array.isArray(row.auto_diagnosis) ? row.auto_diagnosis : []) as DiagnosisEntry[];
  const companyAdvisories = (Array.isArray(row.company_advisories) ? row.company_advisories : []) as CompanyAdvisoryEntry[];
  // pdf_url 발급 후에는 DB 트리거가 원본 UPDATE를 막으므로(전기안전관리법 제24조 보존 요건),
  // 2026-08-24 문구 정리 이전에 저장된 레거시 텍스트("기준 자동판정", "법적 의무사항은 아니며
  // 우리집 전기주치의 자체 권장 기준입니다" 등)가 원본 행에 그대로 남아있는 건들이 있다. 원본은
  // 절대 고치지 않되, 조회(=화면 표시) 시점에는 항상 최신 문구로 보정해서 내보낸다 — 관리자
  // 상세보기·공개 조회 페이지·워커앱 제출결과 등 이 데이터를 읽는 모든 곳이 같은 값을 쓰므로,
  // 여기 한 곳만 고치면 전부 일관되게 반영된다(PDF 재발급 API의 fixLegacyWording과 동일 로직 재사용).
  const fixed = reissueWithFixedWording(checklistItems, autoDiagnosis, companyAdvisories);
  return {
    id: row.id,
    apartmentId: row.apartment_id,
    dong: row.dong,
    ho: row.ho,
    inspectionType: row.inspection_type as UnitInspectionType,
    inspectorWorkerId: row.inspector_worker_id,
    inputActorType: row.input_actor_type === "apt_manager" ? "apt_manager" : "dk_worker",
    aptManagerId: row.apt_manager_id,
    inspectedAt: row.inspected_at,
    checklistItems: fixed.checklistItems,
    loadCurrent: row.load_current,
    igr: row.igr,
    insulationResistance: row.insulation_resistance,
    etcNotes: row.etc_notes,
    autoDiagnosis: fixed.autoDiagnosis,
    residentName: row.resident_name,
    signatureData: row.signature_data,
    residentPhone: row.resident_phone,
    outletInstallYear: row.outlet_install_year,
    switchInstallYear: row.switch_install_year,
    companyAdvisories: fixed.companyAdvisories,
    pdfUrl: row.pdf_url,
    createdAt: row.created_at
  };
}

/** 세대전기점검 기록 생성 — 저장 직전 별표3 규칙엔진으로 auto_diagnosis를 산출해 함께 저장한다 */
export async function pgCreateUnitInspection(actor: UnitInspectionActor, input: UnitInspectionInput): Promise<UnitInspection> {
  const supabase = requireSupabaseAdmin();
  const autoDiagnosis = diagnoseChecklist(input.checklistItems);
  const companyAdvisories = checkCompanyServiceLifeAdvisories({
    outletInstallYear: input.outletInstallYear,
    switchInstallYear: input.switchInstallYear
  });

  const { data, error } = await supabase
    .from("unit_electrical_inspections")
    .insert({
      apartment_id: input.apartmentId,
      dong: input.dong.trim(),
      ho: input.ho.trim(),
      inspection_type: input.inspectionType,
      inspector_worker_id: actor.type === "dk_worker" ? actor.workerId : null,
      input_actor_type: actor.type,
      apt_manager_id: actor.type === "apt_manager" ? actor.aptManagerId : null,
      checklist_items: input.checklistItems,
      load_current: input.loadCurrent,
      igr: input.igr,
      insulation_resistance: input.insulationResistance,
      etc_notes: input.etcNotes.trim(),
      auto_diagnosis: autoDiagnosis,
      resident_name: input.residentName,
      signature_data: input.signatureData,
      resident_phone: input.residentPhone,
      outlet_install_year: input.outletInstallYear,
      switch_install_year: input.switchInstallYear,
      company_advisories: companyAdvisories
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`세대전기점검 기록 저장 실패: ${error?.message ?? "unknown"}`);
  }
  return mapUnitInspection(data as UnitInspectionRow);
}

export async function pgGetUnitInspection(id: string): Promise<UnitInspection | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("unit_electrical_inspections").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (error.code === "22P02") return null; // 잘못된 UUID 형식 — 404로 취급
    throw new Error(`세대전기점검 기록 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return mapUnitInspection(data as UnitInspectionRow);
}

/** 공개 조회 — 문자/카카오 알림톡 결과링크(`/unit-inspection/[id]`)용. 워커 인증 검증 없이 id만으로 조회한다(`/verify/[warrantyNumber]`, `/diagnosis/[id]`와 동일한 노출 모델). */
export async function pgGetUnitInspectionPublic(id: string): Promise<UnitInspection | null> {
  return pgGetUnitInspection(id);
}

export async function pgListUnitInspectionsForApartment(apartmentId: string): Promise<UnitInspection[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("unit_electrical_inspections")
    .select("*")
    .eq("apartment_id", apartmentId)
    .order("inspected_at", { ascending: false });
  if (error) {
    throw new Error(`세대전기점검 목록 조회 실패: ${error.message}`);
  }
  return ((data ?? []) as UnitInspectionRow[]).map(mapUnitInspection);
}

/** 관리자 조회화면용 전체 목록 — 최근 순, 최대 200건 */
export async function pgListAllUnitInspections(limit = 200): Promise<UnitInspection[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("unit_electrical_inspections")
    .select("*")
    .order("inspected_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`세대전기점검 목록 조회 실패: ${error.message}`);
  }
  return ((data ?? []) as UnitInspectionRow[]).map(mapUnitInspection);
}

/**
 * PDF 발급 후 pdf_url을 되채워 넣는다. DB 트리거(prevent_issued_unit_inspection_mutation)가
 * pdf_url이 이미 채워진 행의 UPDATE를 막으므로, 이 함수는 발급 전(draft) 상태에서만 성공한다 —
 * 재호출로 pdf_url을 덮어쓸 수 없어 발급본이 사후에 바뀌는 걸 DB 레벨에서 원천 차단한다.
 */
export async function pgSaveUnitInspectionPdf(id: string, pdfUrl: string): Promise<UnitInspection> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("unit_electrical_inspections")
    .update({ pdf_url: pdfUrl })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`세대전기점검 PDF 저장 실패: ${error?.message ?? "unknown"}`);
  }
  return mapUnitInspection(data as UnitInspectionRow);
}

/**
 * 발급 후 문구 정정본 포인터 전체 조회 — unit_electrical_inspections 원본은 불변이라 건드릴
 * 수 없으므로, 별도 테이블(migration 107)에 "이 건의 대표 PDF는 이 파일"이라는 오버레이만
 * 관리한다. { [inspectionId]: correctedPdfUrl } 형태로 반환해 관리자 화면이 원본 pdfUrl 대신
 * 이 값을 우선 보여줄 수 있게 한다.
 */
export async function pgListUnitInspectionPdfCorrections(): Promise<Record<string, string>> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("unit_inspection_pdf_corrections").select("inspection_id, corrected_pdf_url");
  if (error) {
    throw new Error(`점검표 문구 정정본 목록 조회 실패: ${error.message}`);
  }
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { inspection_id: string; corrected_pdf_url: string }[]) {
    map[row.inspection_id] = row.corrected_pdf_url;
  }
  return map;
}

/** 건 하나의 문구 정정본 포인터 — 공개 조회 페이지(/unit-inspection/[id])가 고객에게 보여줄
 *  PDF 링크를 원본 대신 정정본으로 바꿔치기할 때 쓴다. 없으면 null(원본 그대로 사용). */
export async function pgGetUnitInspectionPdfCorrection(inspectionId: string): Promise<string | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("unit_inspection_pdf_corrections")
    .select("corrected_pdf_url")
    .eq("inspection_id", inspectionId)
    .maybeSingle();
  if (error) {
    throw new Error(`점검표 문구 정정본 조회 실패: ${error.message}`);
  }
  return data?.corrected_pdf_url ?? null;
}

/** 문구 정정본 PDF를 새로 발급할 때마다 최신 파일로 덮어써 포인터를 갱신한다(원본 행은 미변경). */
export async function pgSaveUnitInspectionPdfCorrection(inspectionId: string, correctedPdfUrl: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from("unit_inspection_pdf_corrections")
    .upsert({ inspection_id: inspectionId, corrected_pdf_url: correctedPdfUrl, created_at: new Date().toISOString() });
  if (error) {
    throw new Error(`점검표 문구 정정본 저장 실패: ${error.message}`);
  }
}

/**
 * AI 안전진단 확장판(2026-08-26) — 원본 행이 불변이라 별도 테이블(113)에 저장한다.
 * 아직 생성 전(백그라운드 작업 대기/실패 중)이면 null — 호출부는 이 경우 기존 규칙엔진
 * 기반 canned 문구로 폴백해야 한다.
 */
export type UnitInspectionAiDiagnosisRecord = {
  okSummary: string;
  violations: { item: string; explanation: string }[];
  companyAdvisory: { item: string; explanation: string }[];
  summary: string;
  generatedAt: string;
};

export async function pgGetUnitInspectionAiDiagnosis(inspectionId: string): Promise<UnitInspectionAiDiagnosisRecord | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("unit_inspection_ai_diagnoses")
    .select("ok_summary, violations, company_advisory, summary, generated_at")
    .eq("inspection_id", inspectionId)
    .maybeSingle();
  if (error) {
    throw new Error(`AI 안전진단 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return {
    okSummary: data.ok_summary ?? "",
    violations: Array.isArray(data.violations) ? data.violations : [],
    companyAdvisory: Array.isArray(data.company_advisory) ? data.company_advisory : [],
    summary: data.summary ?? "",
    generatedAt: data.generated_at
  };
}

export async function pgSaveUnitInspectionAiDiagnosis(
  inspectionId: string,
  diagnosis: { okSummary: string; violations: { item: string; explanation: string }[]; companyAdvisory: { item: string; explanation: string }[]; summary: string }
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from("unit_inspection_ai_diagnoses").upsert({
    inspection_id: inspectionId,
    ok_summary: diagnosis.okSummary,
    violations: diagnosis.violations,
    company_advisory: diagnosis.companyAdvisory,
    summary: diagnosis.summary,
    generated_at: new Date().toISOString()
  });
  if (error) {
    throw new Error(`AI 안전진단 저장 실패: ${error.message}`);
  }
}
