import { NextResponse } from "next/server";
import { appendActivityLog } from "@/lib/activity-log";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgDeleteReservationById, pgUpdateReservation } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase 예약 DB가 활성화된 경우에만 사용할 수 있습니다." }, { status: 400 });
  }

  const { id } = await context.params;
  const reservationId = typeof id === "string" ? id.trim() : "";
  if (!reservationId) {
    return NextResponse.json({ message: "예약 ID가 필요합니다." }, { status: 400 });
  }

  const result = await pgDeleteReservationById(reservationId);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  await appendActivityLog({
    action: "reservation_deleted",
    reservationId,
    message: `예약 ${reservationId.slice(0, 8)}… 건이 관리자에 의해 삭제되었습니다.`
  });

  return NextResponse.json({ message: "삭제되었습니다." });
}

/** 세대주(이름)/연락처/주소 수정 — 관리자 전용(2026-09-10 신설). 예약 상태·금액 등 다른 필드는 이 경로로 건드리지 않는다. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase 예약 DB가 활성화된 경우에만 사용할 수 있습니다." }, { status: 400 });
  }

  const { id } = await context.params;
  const reservationId = typeof id === "string" ? id.trim() : "";
  if (!reservationId) {
    return NextResponse.json({ message: "예약 ID가 필요합니다." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string; phone?: string; address?: string };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!name || !phone || !address) {
    return NextResponse.json({ message: "고객명·연락처·주소는 비워둘 수 없습니다." }, { status: 400 });
  }

  const updated = await pgUpdateReservation(reservationId, { name, phone, address });
  if (!updated) {
    return NextResponse.json({ message: "대상 예약을 찾을 수 없습니다." }, { status: 404 });
  }

  await appendActivityLog({
    action: "status_updated",
    reservationId,
    message: `예약 ${reservationId.slice(0, 8)}… 고객정보(이름/연락처/주소)가 관리자에 의해 수정되었습니다.`
  });

  return NextResponse.json({ message: "수정되었습니다." });
}
