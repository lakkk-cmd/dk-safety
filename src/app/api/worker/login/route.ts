import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/reservation-validation";
import { pgFindWorkerByPhone } from "@/lib/reservations-pg";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { signWorkerSessionToken } from "@/lib/worker-auth";
import { verifyWorkerPin } from "@/lib/worker-pin";

const FIRST_VISIT_COOKIE = "dk_first_visit_checked";

export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const body = (await request.json()) as { phone?: string; pin?: string };
  const phoneRaw = body.phone?.trim() ?? "";
  const pin = body.pin?.trim() ?? "";
  if (!phoneRaw || !pin) {
    return NextResponse.json({ message: "연락처와 PIN을 입력해주세요." }, { status: 400 });
  }
  if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(phoneRaw)) {
    return NextResponse.json({ message: "연락처 형식이 올바르지 않습니다." }, { status: 400 });
  }
  try {
    const phone = normalizePhone(phoneRaw);
    const row = await pgFindWorkerByPhone(phone);
    if (!row || !row.active) {
      return NextResponse.json({ message: "등록되지 않았거나 비활성 기사입니다." }, { status: 401 });
    }
    if (!verifyWorkerPin(pin, row.pin_hash)) {
      return NextResponse.json({ message: "PIN이 올바르지 않습니다." }, { status: 401 });
    }
    let token: string;
    let maxAge: number;
    try {
      const signed = signWorkerSessionToken(row.id);
      token = signed.token;
      maxAge = signed.maxAge;
    } catch {
      return NextResponse.json(
        { message: "서버에 WORKER_SESSION_SECRET이 설정되어야 기사 로그인이 가능합니다." },
        { status: 500 }
      );
    }
    const response = NextResponse.json({ message: "로그인되었습니다.", workerId: row.id });
    response.cookies.set({
      name: WORKER_AUTH_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge
    });
    response.cookies.set({
      name: FIRST_VISIT_COOKIE,
      value: "1",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "로그인 처리에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
