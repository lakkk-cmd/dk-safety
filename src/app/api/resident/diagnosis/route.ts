import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getResidentBySessionId, saveDiagnosis, type DiagnosisAnswer } from "@/lib/resident-db";
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

  const body = (await request.json()) as { answers?: DiagnosisAnswer[] };
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

  const fallbackUser =
    user ??
    ({
      id: `guest-${crypto.randomUUID()}`,
      name: "비로그인 사용자",
      phone: "010-0000-0000",
      apartmentId: "apt-guest",
      apartmentName: "비로그인 접수",
      unitNumber: "-",
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    } as const);
  const record = await saveDiagnosis(fallbackUser.id, answers, fallbackUser);
  return NextResponse.json({ message: "자가진단이 저장되었습니다.", result: record }, { status: 201 });
}
