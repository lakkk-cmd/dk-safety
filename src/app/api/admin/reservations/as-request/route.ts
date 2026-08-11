import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgFindReservationById } from "@/lib/reservations-pg";
import { hasReservationTimeConflict } from "@/lib/reservations-store";
import { validateReservationInput } from "@/lib/reservation-validation";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { createAsRequestReservation, AS_SERVICE_TYPE } from "@/lib/as-request";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sourceReservationId?: string;
    detail?: string;
    preferredDate?: string;
    preferredTime?: string;
  };

  const sourceReservationId = body.sourceReservationId?.trim() ?? "";
  if (!sourceReservationId) {
    return NextResponse.json({ message: "sourceReservationId가 필요합니다." }, { status: 400 });
  }

  const original = await pgFindReservationById(sourceReservationId);
  if (!original) {
    return NextResponse.json({ message: "원본 예약을 찾을 수 없습니다." }, { status: 404 });
  }
  if (original.status !== "완료") {
    return NextResponse.json({ message: "완료된 예약에 대해서만 A/S 접수가 가능합니다." }, { status: 400 });
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

  const detail = `[관리자 A/S 접수 · 원 예약 ${original.id}] ${body.detail!.trim()}`.slice(0, 500);

  const created = await createAsRequestReservation({
    original,
    detail,
    preferredDate: body.preferredDate!.trim(),
    preferredTime: body.preferredTime!.trim(),
    source: "phone",
    logContext: `관리자 접수 · 원 예약 바로가기: /admin/reservations?id=${original.id}`
  });

  return NextResponse.json({ message: "A/S 접수가 출장비 무료로 완료되었습니다.", reservation: created }, { status: 201 });
}
