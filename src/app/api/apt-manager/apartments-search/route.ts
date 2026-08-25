import { NextResponse } from "next/server";
import { pgListApartmentsPublicForSignup } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

/** 가입신청 화면(공개)의 단지 검색용 — QR 프리필 또는 검색으로 기존 단지를 고르는 데 쓴다. */
export async function GET() {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  try {
    const apartments = await pgListApartmentsPublicForSignup();
    return NextResponse.json({ apartments });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
