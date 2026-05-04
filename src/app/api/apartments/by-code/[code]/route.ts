import { NextResponse } from "next/server";
import { pgFindApartmentByCode } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET(_: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const apartment = await pgFindApartmentByCode(code.trim().toLowerCase());
  if (!apartment) return NextResponse.json({ message: "아파트를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ apartment });
}
