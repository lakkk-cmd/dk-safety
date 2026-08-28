import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { createConsultationLog } from "@/lib/crm-db";
import { renderUnitInspectionPdf } from "@/lib/document-pdf";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { uploadUnitInspectionPdfCopies } from "@/lib/unit-inspection-pdf-storage";
import {
  applyChecklistResults,
  CHECKLIST_ITEMS,
  MANUAL_CHECK_ITEM_IDS,
  SIMPLE_INSPECTION_ITEM_IDS,
  type ChecklistItemId,
  type ChecklistResult
} from "@/lib/unit-inspection-rules";
import { sendUnitInspectionNotification, type SendChannelResult } from "@/lib/unit-inspection-notification";
import { runUnitInspectionAiDiagnosisAndCorrect } from "@/lib/unit-inspection-ai-diagnosis";
import { pgCreateUnitInspection, pgListUnitInspectionsForApartment, pgSaveUnitInspectionPdf, sanitizeStoragePathSegment, type UnitInspectionInput } from "@/lib/unit-inspections";
import { normalizePhone } from "@/lib/reservation-validation";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

// AI 안전진단 사후보정(after())이 백그라운드에서 끝날 시간을 벌어준다(실측 25~45초 + PDF렌더/업로드).
export const maxDuration = 120;

const VALID_ITEM_IDS = new Set<ChecklistItemId>(CHECKLIST_ITEMS.map((d) => d.id));
const VALID_RESULTS = new Set<ChecklistResult>(["O", "X", "/", "N/A"]);
const SIMPLE_INSPECTABLE_IDS = new Set<ChecklistItemId>(SIMPLE_INSPECTION_ITEM_IDS);
const MANUAL_CHECK_IDS = new Set<ChecklistItemId>(MANUAL_CHECK_ITEM_IDS);

function toStringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const apartmentId = new URL(request.url).searchParams.get("apartmentId")?.trim();
  if (!apartmentId) {
    return NextResponse.json({ message: "apartmentId가 필요합니다." }, { status: 400 });
  }

  try {
    const inspections = await pgListUnitInspectionsForApartment(apartmentId);
    return NextResponse.json({ inspections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const apartmentId = toStringField(body.apartmentId).trim();
  if (!apartmentId) {
    return NextResponse.json({ message: "단지를 선택해주세요." }, { status: 400 });
  }
  const apartment = await pgFindApartmentByIdentifier(apartmentId).catch(() => null);
  if (!apartment) {
    return NextResponse.json({ message: "존재하지 않는 단지입니다." }, { status: 400 });
  }

  const dong = toStringField(body.dong).trim();
  const ho = toStringField(body.ho).trim();
  if (!dong || !ho) {
    return NextResponse.json({ message: "동/호를 입력해주세요." }, { status: 400 });
  }

  const inspectionType = toStringField(body.inspectionType);
  if (inspectionType !== "visit" && inspectionType !== "unvisited_simple") {
    return NextResponse.json({ message: "점검 유형이 올바르지 않습니다." }, { status: 400 });
  }

  const rawResults = Array.isArray(body.checklistResults) ? body.checklistResults : [];
  const overrides: { id: ChecklistItemId; result: ChecklistResult; note: string }[] = [];
  for (const raw of rawResults) {
    if (typeof raw !== "object" || raw === null) continue;
    const id = toStringField((raw as Record<string, unknown>).id) as ChecklistItemId;
    const result = toStringField((raw as Record<string, unknown>).result) as ChecklistResult;
    const note = toStringField((raw as Record<string, unknown>).note);
    if (!VALID_ITEM_IDS.has(id) || !VALID_RESULTS.has(result)) {
      return NextResponse.json({ message: "체크리스트 항목 값이 올바르지 않습니다." }, { status: 400 });
    }
    if (inspectionType === "unvisited_simple" && !SIMPLE_INSPECTABLE_IDS.has(id)) {
      // 미방문 간이점검에서 실측 불가 항목은 서버가 항상 N/A로 고정한다 — 클라이언트가 보내도 무시.
      continue;
    }
    overrides.push({ id, result, note });
  }

  // 현장에서 육안·수기로 직접 확인해야 하는 항목은 반드시 워커가 값을 보내야 다음 단계로
  // 진행된 것으로 본다 — 클라이언트 단계이동 검사와 별개로 서버에서도 한 번 더 막는다
  // (defense in depth, 다른 API들과 동일한 원칙).
  const overriddenIds = new Set(overrides.map((o) => o.id));
  const requiredManualIds = CHECKLIST_ITEMS.filter(
    (d) => MANUAL_CHECK_IDS.has(d.id) && (inspectionType === "visit" || SIMPLE_INSPECTABLE_IDS.has(d.id))
  ).map((d) => d.id);
  const missingManualIds = requiredManualIds.filter((id) => !overriddenIds.has(id));
  if (missingManualIds.length > 0) {
    return NextResponse.json(
      { message: `현장에서 직접 확인해야 하는 항목이 누락되었습니다 (${missingManualIds.length}개).` },
      { status: 400 }
    );
  }

  const loadCurrent = toNullableNumber(body.loadCurrent);
  const igr = toNullableNumber(body.igr);
  const insulationResistance = toNullableNumber(body.insulationResistance);
  const etcNotes = toStringField(body.etcNotes);
  const outletInstallYear = toNullableNumber(body.outletInstallYear);
  const switchInstallYear = toNullableNumber(body.switchInstallYear);
  const checklistItems = applyChecklistResults(inspectionType, overrides, {
    insulationResistance,
    insulationResistanceThresholdMohm: apartment.insulationResistanceThresholdMohm,
    igr,
    leakageCurrentThresholdMa: apartment.leakageCurrentThresholdMa
  });

  const residentNameRaw = toStringField(body.residentName).trim();
  const signatureDataRaw = toStringField(body.signatureData).trim();
  const residentPhoneRaw = toStringField(body.residentPhone).trim();
  if (inspectionType === "visit") {
    if (!residentNameRaw || !signatureDataRaw) {
      return NextResponse.json({ message: "세대방문점검은 세대 성명과 서명이 필요합니다." }, { status: 400 });
    }
    if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(residentPhoneRaw)) {
      return NextResponse.json({ message: "세대 연락처 형식이 올바르지 않습니다." }, { status: 400 });
    }
  }

  const input: UnitInspectionInput = {
    apartmentId: apartment.id,
    dong,
    ho,
    inspectionType,
    checklistItems,
    loadCurrent,
    igr,
    insulationResistance,
    etcNotes,
    residentName: inspectionType === "visit" ? residentNameRaw : null,
    signatureData: inspectionType === "visit" ? signatureDataRaw : null,
    residentPhone: inspectionType === "visit" ? residentPhoneRaw : null,
    outletInstallYear,
    switchInstallYear
  };

  let inspection;
  try {
    inspection = await pgCreateUnitInspection({ type: "dk_worker", workerId: session.workerId }, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "저장에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }

  // PDF는 방문/미방문 관계없이 항상 즉시 발급한다 — 직무고시 서류라 미방문 간이점검도
  // 관리사무소가 다운로드할 수 있어야 한다(2026-08-28 버그 수정: 예전엔 방문점검만 발급했음).
  // 세대 문자 발송·CRM 접점 기록은 방문점검만 — 미방문 간이점검은 세대주 연락처 자체를 안 받는다.
  // 실패해도 점검 저장 자체는 이미 성공했으니 200으로 응답하고, notification 필드로 워커
  // 화면에 실패를 알린다.
  let notification: SendChannelResult | null = null;
  try {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://dkansim.com").replace(/\/$/, "");
    const inspectedAtLabel = new Date(inspection.inspectedAt).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const pdfBytes = await renderUnitInspectionPdf({
      apartmentName: apartment.name,
      electricalSafetyManagerName: apartment.electricalSafetyManagerName,
      dong: inspection.dong,
      ho: inspection.ho,
      inspectedAtLabel,
      inspectionType: inspection.inspectionType,
      checklistItems: inspection.checklistItems,
      loadCurrent: inspection.loadCurrent,
      igr: inspection.igr,
      insulationResistance: inspection.insulationResistance,
      etcNotes: inspection.etcNotes,
      autoDiagnosis: inspection.autoDiagnosis,
      companyAdvisories: inspection.companyAdvisories,
      residentName: inspection.residentName,
      signatureData: inspection.signatureData
    });
    const pdfLocations = await uploadUnitInspectionPdfCopies({
      objectPath: `unit-inspections/${sanitizeStoragePathSegment(inspection.dong)}-${sanitizeStoragePathSegment(inspection.ho)}-${inspection.id}.pdf`,
      pdfBytes
    });
    inspection = await pgSaveUnitInspectionPdf(inspection.id, pdfLocations);

    // AI 안전진단 확장판은 응답을 먼저 보낸 뒤 백그라운드에서 생성한다(사후보정형,
    // 2026-08-26 대표님 결정) — 워커가 현장에서 25~45초씩 더 기다리지 않게.
    const aiDiagnosisInspectionId = inspection.id;
    after(async () => {
      try {
        await runUnitInspectionAiDiagnosisAndCorrect(aiDiagnosisInspectionId);
      } catch (error) {
        console.error("[worker/unit-inspections] AI 안전진단 사후보정 실패:", error);
      }
    });

    if (inspectionType === "visit") {
      const reportUrl = `${appUrl}/unit-inspection/${inspection.id}`;
      notification = await sendUnitInspectionNotification({
        phone: residentPhoneRaw,
        residentName: residentNameRaw,
        apartmentName: apartment.name,
        badCount: inspection.autoDiagnosis.length,
        reportUrl
      });

      await createConsultationLog({
        customer_phone: normalizePhone(residentPhoneRaw),
        customer_name: residentNameRaw,
        channel: "visit",
        content: `세대전기점검(직무고시) — ${apartment.name} ${inspection.dong}동 ${inspection.ho}호`,
        next_contact_at: null,
        status: inspection.autoDiagnosis.length > 0 ? "follow_up" : "resolved",
        result: inspection.autoDiagnosis.length > 0 ? `부적합 ${inspection.autoDiagnosis.length}건 — 수리 안내 필요` : "특이사항 없음",
        worker_id: session.workerId,
        source: "unit_inspection",
        address: `${apartment.name} ${inspection.dong}동 ${inspection.ho}호`
      });
    }
  } catch (error) {
    console.error("[worker/unit-inspections] PDF 발급/문자 발송/CRM 기록 실패:", error);
  }

  return NextResponse.json({ inspection, notification });
}
