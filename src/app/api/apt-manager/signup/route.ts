import { NextResponse } from "next/server";
import { pgFindApartmentByExactName } from "@/lib/apartments-pg";
import { pgCreateApartmentManagerSignup, pgIsApartmentManagerLoginIdTaken } from "@/lib/apartment-managers-pg";
import { hashApartmentManagerPassword } from "@/lib/apt-manager-password";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

const LOGIN_ID_RE = /^[a-zA-Z0-9_-]{4,20}$/;
const PHONE_RE = /^01[0-9]-?\d{3,4}-?\d{4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toStringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const apartmentName = toStringField(body.apartmentName).trim();
  const apartmentAddress = toStringField(body.apartmentAddress).trim();
  const completionDate = toStringField(body.completionDate).trim();
  const totalUnitsRaw = body.totalUnits;

  const name = toStringField(body.name).trim();
  const phone = toStringField(body.phone).trim();
  const loginId = toStringField(body.loginId).trim();
  const password = toStringField(body.password);

  // 단지입력 탭(단지명/단지주소/준공일/세대수)이 정보입력 탭보다 먼저 채워져야 하고, 하나라도
  // 비면 가입 자체가 안 되게 — 프런트 스텝가드와 별개로 서버에서도 전부 필수로 재검증한다.
  if (!apartmentName) return NextResponse.json({ message: "단지명을 입력해주세요." }, { status: 400 });
  if (!apartmentAddress) return NextResponse.json({ message: "단지 주소를 입력해주세요." }, { status: 400 });
  if (!DATE_RE.test(completionDate)) return NextResponse.json({ message: "준공일을 입력해주세요." }, { status: 400 });
  const totalUnits = Number(totalUnitsRaw);
  if (!Number.isFinite(totalUnits) || totalUnits <= 0) {
    return NextResponse.json({ message: "세대수를 올바르게 입력해주세요." }, { status: 400 });
  }

  if (!name) return NextResponse.json({ message: "이름을 입력해주세요." }, { status: 400 });
  if (!PHONE_RE.test(phone)) return NextResponse.json({ message: "연락처 형식이 올바르지 않습니다." }, { status: 400 });
  if (!LOGIN_ID_RE.test(loginId)) {
    return NextResponse.json({ message: "아이디는 영문/숫자/_/- 4~20자로 입력해주세요." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ message: "비밀번호는 8자 이상으로 입력해주세요." }, { status: 400 });
  }

  try {
    if (await pgIsApartmentManagerLoginIdTaken(loginId)) {
      return NextResponse.json({ message: "이미 사용 중인 아이디입니다." }, { status: 409 });
    }

    // 검색된 단지명이 이미 등록된 단지와 정확히 일치하면 그 단지에 연결한다 — 안 그러면 대표님이
    // 미리 세팅해둔 전기선임자·판정기준값을 무시한 채 같은 단지가 중복 생성된다.
    const existingApartment = await pgFindApartmentByExactName(apartmentName);

    const manager = await pgCreateApartmentManagerSignup({
      apartmentId: existingApartment?.id ?? null,
      apartmentNameRequested: existingApartment ? null : apartmentName,
      apartmentAddressRequested: existingApartment ? null : apartmentAddress,
      apartmentCompletionDateRequested: existingApartment ? null : completionDate,
      totalUnitsRequested: existingApartment ? null : Math.round(totalUnits),
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
