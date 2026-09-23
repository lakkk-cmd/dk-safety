import { NextResponse } from "next/server";
import { getApartmentManagerIdFromCookies } from "@/lib/apt-manager-session-server";
import { pgGetApartmentManager, pgResetApartmentManagerPassword } from "@/lib/apartment-managers-pg";
import { hashApartmentManagerPassword, verifyApartmentManagerPassword } from "@/lib/apt-manager-password";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

function toStringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 전기과장 본인의 비밀번호 변경(관리자 초기화 후 로그인한 임시 비밀번호를 직접 바꾸는 경로).
 * 관리자의 reset-password(비밀번호 확인 없이 강제 재발급)와 달리, 여기는 현재 비밀번호 확인이
 * 반드시 필요하다 — 세션 쿠키만으로는 비밀번호를 아는지 알 수 없어서다. */
export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const managerId = await getApartmentManagerIdFromCookies();
  if (!managerId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const currentPassword = toStringField(body.currentPassword);
  const newPassword = toStringField(body.newPassword);
  if (!currentPassword) {
    return NextResponse.json({ message: "현재 비밀번호를 입력해주세요." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ message: "새 비밀번호는 8자 이상으로 입력해주세요." }, { status: 400 });
  }

  try {
    const manager = await pgGetApartmentManager(managerId);
    if (!manager || manager.approvalStatus !== "approved" || !manager.apartmentId) {
      return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!verifyApartmentManagerPassword(currentPassword, manager.passwordHash)) {
      return NextResponse.json({ message: "현재 비밀번호가 일치하지 않습니다." }, { status: 401 });
    }
    await pgResetApartmentManagerPassword(managerId, hashApartmentManagerPassword(newPassword));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "비밀번호 변경에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
