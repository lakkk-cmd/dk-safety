import { NextResponse } from "next/server";
import { createResidentSession } from "@/lib/resident-db";
import { RESIDENT_AUTH_COOKIE } from "@/lib/site-config";

const FIRST_VISIT_COOKIE = "dk_first_visit_checked";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    phone?: string;
    apartmentId?: string;
    unitNumber?: string;
  };

  const name = body.name?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const apartmentId = body.apartmentId?.trim() ?? "";
  const unitNumber = body.unitNumber?.trim() ?? "";

  if (!name || !phone || !apartmentId || !unitNumber) {
    return NextResponse.json({ message: "성함, 연락처, 아파트, 동호수를 모두 입력해주세요." }, { status: 400 });
  }

  if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(phone)) {
    return NextResponse.json({ message: "전화번호 형식을 확인해주세요. 예: 010-1234-5678" }, { status: 400 });
  }

  try {
    const { user, session } = await createResidentSession({ name, phone, apartmentId, unitNumber });
    const response = NextResponse.json({ message: "입주민 로그인 완료", user });
    response.cookies.set({
      name: RESIDENT_AUTH_COOKIE,
      value: session.id,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12
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
    return NextResponse.json({ message: error instanceof Error ? error.message : "로그인 실패" }, { status: 400 });
  }
}
