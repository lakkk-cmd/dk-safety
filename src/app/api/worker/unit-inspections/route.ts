import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import {
  applyChecklistResults,
  CHECKLIST_ITEMS,
  MANUAL_CHECK_ITEM_IDS,
  SIMPLE_INSPECTION_ITEM_IDS,
  type ChecklistItemId,
  type ChecklistResult
} from "@/lib/unit-inspection-rules";
import { pgCreateUnitInspection, pgListUnitInspectionsForApartment, type UnitInspectionInput } from "@/lib/unit-inspections";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

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
  const checklistItems = applyChecklistResults(inspectionType, overrides, {
    insulationResistance,
    insulationResistanceThresholdMohm: apartment.insulationResistanceThresholdMohm,
    igr,
    leakageCurrentThresholdMa: apartment.leakageCurrentThresholdMa
  });

  const residentNameRaw = toStringField(body.residentName).trim();
  const signatureDataRaw = toStringField(body.signatureData).trim();
  if (inspectionType === "visit" && (!residentNameRaw || !signatureDataRaw)) {
    return NextResponse.json({ message: "세대방문점검은 세대 성명과 서명이 필요합니다." }, { status: 400 });
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
    signatureData: inspectionType === "visit" ? signatureDataRaw : null
  };

  try {
    const inspection = await pgCreateUnitInspection(session.workerId, input);
    return NextResponse.json({ inspection });
  } catch (error) {
    const message = error instanceof Error ? error.message : "저장에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
