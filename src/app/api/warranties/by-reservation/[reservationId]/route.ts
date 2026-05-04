import { NextResponse } from "next/server";
import { pgFindWarrantyByReservationId } from "@/lib/warranty-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET(_: Request, context: { params: Promise<{ reservationId: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { reservationId } = await context.params;
  const warranty = await pgFindWarrantyByReservationId(reservationId);
  if (!warranty) {
    return NextResponse.json({ message: "보증서가 아직 발급되지 않았습니다." }, { status: 404 });
  }
  return NextResponse.json({ warranty });
}
