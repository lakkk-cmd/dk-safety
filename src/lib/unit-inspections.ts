import { requireSupabaseAdmin } from "@/lib/supabase-pg";
import { diagnoseChecklist, type ChecklistEntry, type DiagnosisEntry } from "@/lib/unit-inspection-rules";

export type UnitInspectionType = "visit" | "unvisited_simple";

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
  /** 세대방문점검만 필수 — 미방문 간이점검은 둘 다 null */
  residentName: string | null;
  signatureData: string | null;
};

export type UnitInspection = UnitInspectionInput & {
  id: string;
  inspectorWorkerId: string | null;
  inspectedAt: string;
  autoDiagnosis: DiagnosisEntry[];
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
  inspected_at: string;
  checklist_items: unknown;
  load_current: number | null;
  igr: number | null;
  insulation_resistance: number | null;
  etc_notes: string;
  auto_diagnosis: unknown;
  resident_name: string | null;
  signature_data: string | null;
  pdf_url: string | null;
  created_at: string;
};

function mapUnitInspection(row: UnitInspectionRow): UnitInspection {
  return {
    id: row.id,
    apartmentId: row.apartment_id,
    dong: row.dong,
    ho: row.ho,
    inspectionType: row.inspection_type as UnitInspectionType,
    inspectorWorkerId: row.inspector_worker_id,
    inspectedAt: row.inspected_at,
    checklistItems: (Array.isArray(row.checklist_items) ? row.checklist_items : []) as ChecklistEntry[],
    loadCurrent: row.load_current,
    igr: row.igr,
    insulationResistance: row.insulation_resistance,
    etcNotes: row.etc_notes,
    autoDiagnosis: (Array.isArray(row.auto_diagnosis) ? row.auto_diagnosis : []) as DiagnosisEntry[],
    residentName: row.resident_name,
    signatureData: row.signature_data,
    pdfUrl: row.pdf_url,
    createdAt: row.created_at
  };
}

/** 세대전기점검 기록 생성 — 저장 직전 별표3 규칙엔진으로 auto_diagnosis를 산출해 함께 저장한다 */
export async function pgCreateUnitInspection(workerId: string, input: UnitInspectionInput): Promise<UnitInspection> {
  const supabase = requireSupabaseAdmin();
  const autoDiagnosis = diagnoseChecklist(input.checklistItems);

  const { data, error } = await supabase
    .from("unit_electrical_inspections")
    .insert({
      apartment_id: input.apartmentId,
      dong: input.dong.trim(),
      ho: input.ho.trim(),
      inspection_type: input.inspectionType,
      inspector_worker_id: workerId,
      checklist_items: input.checklistItems,
      load_current: input.loadCurrent,
      igr: input.igr,
      insulation_resistance: input.insulationResistance,
      etc_notes: input.etcNotes.trim(),
      auto_diagnosis: autoDiagnosis,
      resident_name: input.residentName,
      signature_data: input.signatureData
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
