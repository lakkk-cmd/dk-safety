import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import {
  approveKakaoQueueItem,
  deleteKakaoQueueItem,
  listKakaoQueueForApproval,
  rejectKakaoQueueItem,
} from "@/lib/content-pipeline";
import { isKakaoConnected, KAKAO_OAUTH_ENABLED } from "@/lib/kakao-oauth";

/** 카카오 전용 승인 화면(/hq/kakao)이 쓰는 목록 조회 — 유튜브/블로그는 절대 섞지 않는다
 *  (2026-09-06: hq에 콘텐츠 전체를 합친 승인 화면을 만들었다가, "카카오만 승인 가능해야
 *  한다"는 지시로 다시 카카오 전용으로 분리). */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const [kakaoQueue, kakaoConnected] = await Promise.all([listKakaoQueueForApproval(), isKakaoConnected()]);
    return NextResponse.json({
      kakaoQueue,
      kakaoConnected,
      kakaoOAuthEnabled: KAKAO_OAUTH_ENABLED,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  const body = (await request.json()) as { id?: string; action?: "approve" | "reject"; reason?: string };
  if (!body.id || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json({ message: "id, action(approve|reject) 파라미터 필요" }, { status: 400 });
  }

  try {
    if (body.action === "approve") {
      await approveKakaoQueueItem(body.id);
      return NextResponse.json({ message: "카카오 채널에 발행 알림을 전송했습니다." });
    }

    await rejectKakaoQueueItem(body.id, body.reason ?? "");
    return NextResponse.json({ message: "반려되었습니다." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "처리 실패" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "id 파라미터 필요" }, { status: 400 });

  try {
    await deleteKakaoQueueItem(id);
    return NextResponse.json({ message: "삭제되었습니다." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "삭제 실패" },
      { status: 500 },
    );
  }
}
