import { NextResponse } from "next/server";
import { getApartmentManagerIdFromCookies } from "@/lib/apt-manager-session-server";
import { pgGetApartmentManager, pgUpdateApartmentManagerProfile } from "@/lib/apartment-managers-pg";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

const PHONE_RE = /^01[0-9]-?\d{3,4}-?\d{4}$/;

function toStringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function requireApprovedManager(managerId: string) {
  const manager = await pgGetApartmentManager(managerId);
  if (!manager || manager.approvalStatus !== "approved" || !manager.apartmentId) return null;
  return manager;
}

export async function GET() {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const managerId = await getApartmentManagerIdFromCookies();
  if (!managerId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const manager = await requireApprovedManager(managerId);
    if (!manager) {
      return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    const apartment = await pgFindApartmentByIdentifier(manager.apartmentId!);
    return NextResponse.json({
      manager: { id: manager.id, name: manager.name, phone: manager.phone, loginId: manager.loginId },
      apartment: apartment ? { id: apartment.id, name: apartment.name, totalUnits: apartment.totalUnits } : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

/** 전기과장 본인의 이름/휴대전화 자가수정 — "정보관리" 탭. 단지 정보는 이 라우트가 다루지 않는다. */
export async function PATCH(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const managerId = await getApartmentManagerIdFromCookies();
  if (!managerId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = toStringField(body.name).trim();
  const phone = toStringField(body.phone).trim();
  if (!name) return NextResponse.json({ message: "이름을 입력해주세요." }, { status: 400 });
  if (!PHONE_RE.test(phone)) return NextResponse.json({ message: "연락처 형식이 올바르지 않습니다." }, { status: 400 });

  try {
    const manager = await requireApprovedManager(managerId);
    if (!manager) {
      return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    const updated = await pgUpdateApartmentManagerProfile(managerId, { name, phone });
    return NextResponse.json({ manager: { id: updated.id, name: updated.name, phone: updated.phone, loginId: updated.loginId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수정에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
