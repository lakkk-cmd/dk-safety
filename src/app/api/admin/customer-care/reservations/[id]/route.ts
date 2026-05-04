import { NextResponse } from "next/server";
import { appendActivityLog } from "@/lib/activity-log";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgDeleteReservationById } from "@/lib/reservations-pg";
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
