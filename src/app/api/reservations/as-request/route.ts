import { NextResponse } from "next/server";
import { normalizePhone, validateReservationInput } from "@/lib/reservation-validation";
import { pgFindReservationById } from "@/lib/reservations-pg";
import { hasReservationTimeConflict } from "@/lib/reservations-store";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { createAsRequestReservation, AS_SERVICE_TYPE } from "@/lib/as-request";

/**
 * 고객이 "내 예약 현황"(/status, 전화번호 조회)에서 완료된 과거 건에 대해 직접 A/S를
 * 신청하는 공개 엔드포인트. 관리자 인증이 없으므로, 요청한 phone이 원 예약의 phone과
 * 일치할 때만 처리한다(임의 reservationId로 남의 건을 A/S 신청하는 것을 막는 최소 검증).
 */
export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sourceReservationId?: string;
    phone?: string;
    detail?: string;
    preferredDate?: string;
    preferredTime?: string;
  };

  const sourceReservationId = body.sourceReservationId?.trim() ?? "";
  const phoneRaw = body.phone?.trim() ?? "";
  if (!sourceReservationId || !phoneRaw) {
    return NextResponse.json({ message: "sourceReservationId / phone이 필요합니다." }, { status: 400 });
  }

  const original = await pgFindReservationById(sourceReservationId);
  if (!original) {
    return NextResponse.json({ message: "원본 예약을 찾을 수 없습니다." }, { status: 404 });
  }
  if (normalizePhone(phoneRaw) !== normalizePhone(original.phone)) {
    return NextResponse.json({ message: "본인 예약 건에 대해서만 A/S 신청이 가능합니다." }, { status: 403 });
  }
  if (original.status !== "완료") {
    return NextResponse.json({ message: "완료된 예약에 대해서만 A/S 신청이 가능합니다." }, { status: 400 });
  }

  const validationError = validateReservationInput({
    name: original.name,
    phone: original.phone,
    address: original.address,
    serviceType: AS_SERVICE_TYPE,
    preferredDate: body.preferredDate,
    preferredTime: body.preferredTime,
    detail: body.detail
  });
  if (validationError) {
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  const hasConflict = await hasReservationTimeConflict(body.preferredDate!.trim(), body.preferredTime!.trim());
  if (hasConflict) {
    return NextResponse.json({ message: "선택하신 방문 요청시간은 이미 예약되어 있습니다. 다른 시간을 선택해주세요." }, { status: 409 });
  }

  const detail = `[내 예약 현황 A/S 신청 · 원 예약 ${original.id}] ${body.detail!.trim()}`.slice(0, 500);

  const created = await createAsRequestReservation({
    original,
    detail,
    preferredDate: body.preferredDate!.trim(),
    preferredTime: body.preferredTime!.trim(),
    source: "online",
    logContext: `내 예약 현황(/status)에서 신청 · 원 예약 바로가기: /admin/reservations?id=${original.id}`
  });

  return NextResponse.json({ message: "A/S 신청이 출장비 무료로 접수되었습니다.", reservation: created }, { status: 201 });
}
