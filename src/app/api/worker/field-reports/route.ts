import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  BREAKER_VISUAL_STATUS_OPTIONS,
  GROUNDING_STATUS_OPTIONS,
  RISK_LEVEL_OPTIONS,
  URGENT_PART_OPTIONS,
  pgCreateFieldReport,
  type FieldReportInput
} from "@/lib/field-reports";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringField(value: unknown): string {
  return typeof value === "string" ? value : "";
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

  const body = (await request.json()) as Record<string, unknown>;
  const reservationId = toStringField(body.reservationId).trim();
  if (!reservationId) {
    return NextResponse.json({ message: "예약을 선택해주세요." }, { status: 400 });
  }
  const apartmentAddress = toStringField(body.apartmentAddress).trim();
  if (!apartmentAddress) {
    return NextResponse.json({ message: "세대 주소가 필요합니다." }, { status: 400 });
  }

  const breakerVisualStatus = toStringField(body.breakerVisualStatus);
  if (breakerVisualStatus && !BREAKER_VISUAL_STATUS_OPTIONS.includes(breakerVisualStatus as never)) {
    return NextResponse.json({ message: "차단기 육안 상태 값이 올바르지 않습니다." }, { status: 400 });
  }
  const groundingStatus = toStringField(body.groundingStatus);
  if (groundingStatus && !GROUNDING_STATUS_OPTIONS.includes(groundingStatus as never)) {
    return NextResponse.json({ message: "접지 연결 상태 값이 올바르지 않습니다." }, { status: 400 });
  }
  const riskLevel = toStringField(body.riskLevel);
  if (riskLevel && !RISK_LEVEL_OPTIONS.includes(riskLevel as never)) {
    return NextResponse.json({ message: "위험등급 값이 올바르지 않습니다." }, { status: 400 });
  }
  const urgentParts = Array.isArray(body.urgentParts)
    ? body.urgentParts.filter((v): v is string => typeof v === "string" && URGENT_PART_OPTIONS.includes(v as never))
    : [];
  const status = body.status === "submitted" ? "submitted" : "draft";

  if (status === "submitted" && !riskLevel) {
    return NextResponse.json({ message: "위험등급을 선택해야 제출할 수 있습니다." }, { status: 400 });
  }

  const input: FieldReportInput = {
    reservationId,
    apartmentAddress,
    breakerTripCurrentMa: toNullableNumber(body.breakerTripCurrentMa),
    mainBreakerCapacityA: toNullableNumber(body.mainBreakerCapacityA),
    insulationResistanceMohm: toNullableNumber(body.insulationResistanceMohm),
    leakageDetected: Boolean(body.leakageDetected),
    leakagePathNote: toStringField(body.leakagePathNote),
    breakerYear: toNullableNumber(body.breakerYear),
    breakerVisualStatus: (breakerVisualStatus || null) as FieldReportInput["breakerVisualStatus"],
    unitAreaSqm: toNullableNumber(body.unitAreaSqm),
    outletOverheat: Boolean(body.outletOverheat),
    outletOverheatNote: toStringField(body.outletOverheatNote),
    wiringDamage: Boolean(body.wiringDamage),
    wiringDamageNote: toStringField(body.wiringDamageNote),
    groundingStatus: (groundingStatus || null) as FieldReportInput["groundingStatus"],
    riskLevel: (riskLevel || null) as FieldReportInput["riskLevel"],
    urgentParts: urgentParts as FieldReportInput["urgentParts"],
    siteMemo: toStringField(body.siteMemo),
    photoUrls: Array.isArray(body.photoUrls) ? body.photoUrls.filter((v): v is string => typeof v === "string").slice(0, 3) : [],
    status
  };

  try {
    const report = await pgCreateFieldReport(session.workerId, input);
    return NextResponse.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "저장에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
