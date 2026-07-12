import { NextResponse } from "next/server";
import { pgCountActiveAdminAccounts, pgUpdateAdminAccount } from "@/lib/admin-accounts-pg";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { normalizePhone } from "@/lib/reservation-validation";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { hashWorkerPin } from "@/lib/worker-pin";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  const body = (await request.json()) as { name?: string; phone?: string; password?: string; active?: boolean };

  const patch: { name?: string; phone?: string; passwordHash?: string; active?: boolean } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 30) {
      return NextResponse.json({ message: "이름은 2~30자로 입력해주세요." }, { status: 400 });
    }
    patch.name = name;
  }
  if (typeof body.phone === "string") {
    const phoneRaw = body.phone.trim();
    if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(phoneRaw)) {
      return NextResponse.json({ message: "연락처 형식이 올바르지 않습니다." }, { status: 400 });
    }
    patch.phone = normalizePhone(phoneRaw);
  }
  if (typeof body.password === "string" && body.password.trim().length > 0) {
    const password = body.password.trim();
    if (password.length < 4 || password.length > 40) {
      return NextResponse.json({ message: "비밀번호는 4자 이상 40자 이하로 설정해주세요." }, { status: 400 });
    }
    patch.passwordHash = hashWorkerPin(password);
  }
  if (typeof body.active === "boolean") {
    if (!body.active) {
      const activeCount = await pgCountActiveAdminAccounts();
      if (activeCount <= 1) {
        return NextResponse.json({ message: "마지막 남은 활성 계정은 비활성화할 수 없습니다." }, { status: 409 });
      }
    }
    patch.active = body.active;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ message: "변경할 내용이 없습니다." }, { status: 400 });
  }

  try {
    const account = await pgUpdateAdminAccount(id, patch);
    return NextResponse.json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "관리자 계정 수정에 실패했습니다.";
    const isDuplicate = message.includes("duplicate") || message.includes("unique");
    return NextResponse.json(
      { message: isDuplicate ? "이미 등록된 연락처입니다." : message },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}
