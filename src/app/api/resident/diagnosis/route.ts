import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getResidentBySessionId,
  resolveApartmentInfoByCode,
  saveDiagnosis,
  type DiagnosisAnswer
} from "@/lib/resident-db";
import { RESIDENT_AUTH_COOKIE } from "@/lib/site-config";
import { checkIpRateLimit } from "@/lib/ip-rate-limit";

export async function POST(request: Request) {
  const rateLimit = checkIpRateLimit(request, "resident-diagnosis", 30, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(RESIDENT_AUTH_COOKIE)?.value;
  const user = sessionId ? await getResidentBySessionId(sessionId) : null;

  const body = (await request.json()) as { answers?: DiagnosisAnswer[]; tenant?: string };
  const answers = body.answers ?? [];
  if (!Array.isArray(answers) || answers.length !== 6) {
    return NextResponse.json({ message: "자가진단 6문항을 모두 제출해주세요." }, { status: 400 });
  }

  const valid = answers.every(
    (item) => typeof item.questionId === "number" && ["high", "caution", "unknown", "safe"].includes(item.answer)
  );
  if (!valid) {
    return NextResponse.json({ message: "문항 응답 형식이 올바르지 않습니다." }, { status: 400 });
  }

  let fallbackUser = user;
  if (!fallbackUser) {
    // 비로그인 제출도 QR/링크에 실린 단지 코드(tenant)가 있으면 실제 단지에 붙여
    // "비로그인 접수"라는 이름 없는 통 하나로 뭉치지 않게 한다 — 게스트라는 표시(guest- id)는 유지해
    // 입주민 통계(getResidentSafetyAnalytics)에서 계속 분리 집계된다.
    let apartmentId = "apt-guest";
    let apartmentName = "비로그인 접수";
    const tenant = body.tenant?.trim();
    if (tenant) {
      const resolved = await resolveApartmentInfoByCode(tenant).catch(() => null);
      if (resolved) {
        apartmentId = `apt-guest:${resolved.code}`;
        apartmentName = `${resolved.name} (비로그인 접수)`;
      }
    }
    fallbackUser = {
      id: `guest-${crypto.randomUUID()}`,
      name: "비로그인 사용자",
      phone: "010-0000-0000",
      apartmentId,
      apartmentName,
      unitNumber: "-",
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };
  }
  const record = await saveDiagnosis(fallbackUser.id, answers, fallbackUser);
  return NextResponse.json({ message: "자가진단이 저장되었습니다.", result: record }, { status: 201 });
}
