import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { normalizePhone } from "@/lib/reservation-validation";
import { pgCreateWorker, pgFindWorkerByPhone, pgListWorkers } from "@/lib/reservations-pg";
import { hashWorkerPin } from "@/lib/worker-pin";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ workers: [] });
  }
  try {
    const workers = await pgListWorkers();
    return NextResponse.json({ workers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "기사 목록을 불러오지 못했습니다.";
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
  const body = (await request.json()) as { name?: string; phone?: string; pin?: string };
  const name = body.name?.trim() ?? "";
  const phoneRaw = body.phone?.trim() ?? "";
  const pin = body.pin?.trim() ?? "";
  if (name.length < 2 || name.length > 30) {
    return NextResponse.json({ message: "이름은 2~30자로 입력해주세요." }, { status: 400 });
  }
  if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(phoneRaw)) {
    return NextResponse.json({ message: "연락처 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (pin.length < 4 || pin.length > 12) {
    return NextResponse.json({ message: "PIN은 4~12자리로 설정해주세요." }, { status: 400 });
  }
  try {
    const phone = normalizePhone(phoneRaw);
    const before = await pgFindWorkerByPhone(phone);
    const worker = await pgCreateWorker({ name, phone, pinHash: hashWorkerPin(pin) });
    return NextResponse.json({ worker, reissued: Boolean(before) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "기사 등록에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
