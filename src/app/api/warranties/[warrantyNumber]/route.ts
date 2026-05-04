import { NextResponse } from "next/server";
import { pgFindWarrantyByNumber } from "@/lib/warranty-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET(_: Request, context: { params: Promise<{ warrantyNumber: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { warrantyNumber } = await context.params;
  const warranty = await pgFindWarrantyByNumber(warrantyNumber);
  if (!warranty) {
    return NextResponse.json({ message: "보증서를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ warranty });
}
