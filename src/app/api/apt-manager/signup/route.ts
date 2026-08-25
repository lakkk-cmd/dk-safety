import { NextResponse } from "next/server";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { pgCreateApartmentManagerSignup, pgIsApartmentManagerLoginIdTaken } from "@/lib/apartment-managers-pg";
import { hashApartmentManagerPassword } from "@/lib/apt-manager-password";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

const LOGIN_ID_RE = /^[a-zA-Z0-9_-]{4,20}$/;
const PHONE_RE = /^01[0-9]-?\d{3,4}-?\d{4}$/;

function toStringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const name = toStringField(body.name).trim();
  const phone = toStringField(body.phone).trim();
  const loginId = toStringField(body.loginId).trim();
  const password = toStringField(body.password);
  const apartmentId = toStringField(body.apartmentId).trim();
  const apartmentNameRequested = toStringField(body.apartmentNameRequested).trim();
  const apartmentAddressRequested = toStringField(body.apartmentAddressRequested).trim();
  const totalUnitsRequestedRaw = body.totalUnitsRequested;

  if (!name) return NextResponse.json({ message: "이름을 입력해주세요." }, { status: 400 });
  if (!PHONE_RE.test(phone)) return NextResponse.json({ message: "연락처 형식이 올바르지 않습니다." }, { status: 400 });
  if (!LOGIN_ID_RE.test(loginId)) {
    return NextResponse.json({ message: "아이디는 영문/숫자/_/- 4~20자로 입력해주세요." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ message: "비밀번호는 8자 이상으로 입력해주세요." }, { status: 400 });
  }
  if (!apartmentId && !apartmentNameRequested) {
    return NextResponse.json({ message: "단지를 선택하거나, 신규 단지 정보를 입력해주세요." }, { status: 400 });
  }

  try {
    if (await pgIsApartmentManagerLoginIdTaken(loginId)) {
      return NextResponse.json({ message: "이미 사용 중인 아이디입니다." }, { status: 409 });
    }

    let resolvedApartmentId: string | null = null;
    let totalUnitsRequested: number | null = null;

    if (apartmentId) {
      const apartment = await pgFindApartmentByIdentifier(apartmentId);
      if (!apartment) {
        return NextResponse.json({ message: "존재하지 않는 단지입니다." }, { status: 400 });
      }
      resolvedApartmentId = apartment.id;
    } else {
      const n = Number(totalUnitsRequestedRaw);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ message: "예상 세대수를 올바르게 입력해주세요." }, { status: 400 });
      }
      totalUnitsRequested = Math.round(n);
    }

    const manager = await pgCreateApartmentManagerSignup({
      apartmentId: resolvedApartmentId,
      apartmentNameRequested: resolvedApartmentId ? null : apartmentNameRequested,
      apartmentAddressRequested: resolvedApartmentId ? null : apartmentAddressRequested || null,
      totalUnitsRequested: resolvedApartmentId ? null : totalUnitsRequested,
      name,
      phone,
      loginId,
      passwordHash: hashApartmentManagerPassword(password)
    });

    return NextResponse.json({ manager: { id: manager.id, approvalStatus: manager.approvalStatus } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "가입신청에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
