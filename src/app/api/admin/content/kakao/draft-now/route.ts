import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { draftKakaoItemById } from "@/lib/content-pipeline";

export const maxDuration = 60;

/** hq/kakao 화면의 "지금 초안 작성" 버튼 — 콘텐츠 자동생성 크론이 중단된 상태라
 *  planning에 멈춰있는 항목 하나를 대표님이 원할 때만 수동으로 승인 대기 단계까지 진행시킨다. */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ message: "id 파라미터 필요" }, { status: 400 });

  try {
    const { status } = await draftKakaoItemById(body.id);
    const message =
      status === "pending_approval"
        ? "초안 작성 완료 — 승인 대기 상태가 되었습니다."
        : `초안은 작성됐지만 품질검증에 걸려 검토가 필요합니다 (상태: ${status}).`;
    return NextResponse.json({ message, status });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "초안 작성 실패" },
      { status: 500 },
    );
  }
}
