import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/reservation-validation";
import { pgFindReservationsByPhone } from "@/lib/reservations-pg";
import { pgFindFieldReportByReservationId } from "@/lib/field-reports";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const phoneRaw = new URL(request.url).searchParams.get("phone")?.trim() ?? "";
  if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(phoneRaw)) {
    return NextResponse.json({ message: "연락처 형식이 올바르지 않습니다." }, { status: 400 });
  }
  try {
    const phone = normalizePhone(phoneRaw);
    const reservations = await pgFindReservationsByPhone(phone);
    const items = await Promise.all(
      reservations.map(async (reservation) => ({
        reservation,
        fieldReport: await pgFindFieldReportByReservationId(reservation.id)
      }))
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
