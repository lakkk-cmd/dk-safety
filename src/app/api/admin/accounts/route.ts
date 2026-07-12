import { NextResponse } from "next/server";
import { pgCreateAdminAccount, pgListAdminAccounts } from "@/lib/admin-accounts-pg";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { normalizePhone } from "@/lib/reservation-validation";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { hashWorkerPin } from "@/lib/worker-pin";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ accounts: [] });
  }
  try {
    const accounts = await pgListAdminAccounts();
    return NextResponse.json({ accounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "관리자 계정 목록을 불러오지 못했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const body = (await request.json()) as { name?: string; phone?: string; password?: string };
  const name = body.name?.trim() ?? "";
  const phoneRaw = body.phone?.trim() ?? "";
  const password = body.password?.trim() ?? "";
  if (name.length < 2 || name.length > 30) {
    return NextResponse.json({ message: "이름은 2~30자로 입력해주세요." }, { status: 400 });
  }
  if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(phoneRaw)) {
    return NextResponse.json({ message: "연락처 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (password.length < 4 || password.length > 40) {
    return NextResponse.json({ message: "비밀번호는 4자 이상 40자 이하로 설정해주세요." }, { status: 400 });
  }
  try {
    const account = await pgCreateAdminAccount({
      name,
      phone: normalizePhone(phoneRaw),
      passwordHash: hashWorkerPin(password)
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "관리자 계정 등록에 실패했습니다.";
    const isDuplicate = message.includes("duplicate") || message.includes("unique");
    return NextResponse.json(
      { message: isDuplicate ? "이미 등록된 연락처입니다." : message },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}
