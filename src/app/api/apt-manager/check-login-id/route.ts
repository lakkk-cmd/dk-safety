import { NextResponse } from "next/server";
import { pgIsApartmentManagerLoginIdTaken } from "@/lib/apartment-managers-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

const LOGIN_ID_RE = /^[a-zA-Z0-9_-]{4,20}$/;

export async function GET(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const loginId = new URL(request.url).searchParams.get("loginId")?.trim() ?? "";
  if (!LOGIN_ID_RE.test(loginId)) {
    return NextResponse.json({ message: "아이디는 영문/숫자/_/- 4~20자로 입력해주세요." }, { status: 400 });
  }
  try {
    const taken = await pgIsApartmentManagerLoginIdTaken(loginId);
    return NextResponse.json({ available: !taken });
  } catch (error) {
    const message = error instanceof Error ? error.message : "확인에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
