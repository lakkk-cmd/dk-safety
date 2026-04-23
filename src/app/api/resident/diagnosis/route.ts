import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getResidentBySessionId, saveDiagnosis, type DiagnosisAnswer } from "@/lib/resident-db";
import { RESIDENT_AUTH_COOKIE } from "@/lib/site-config";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(RESIDENT_AUTH_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const user = await getResidentBySessionId(sessionId);
  if (!user) {
    return NextResponse.json({ message: "세션이 만료되었습니다. 다시 로그인해주세요." }, { status: 401 });
  }

  const body = (await request.json()) as { answers?: DiagnosisAnswer[] };
  const answers = body.answers ?? [];
  if (!Array.isArray(answers) || answers.length !== 15) {
    return NextResponse.json({ message: "자가진단 15문항을 모두 제출해주세요." }, { status: 400 });
  }

  const valid = answers.every(
    (item) => typeof item.questionId === "number" && ["high", "caution", "unknown", "safe"].includes(item.answer)
  );
  if (!valid) {
    return NextResponse.json({ message: "문항 응답 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const record = await saveDiagnosis(user.id, answers);
  return NextResponse.json({ message: "자가진단이 저장되었습니다.", result: record }, { status: 201 });
}
