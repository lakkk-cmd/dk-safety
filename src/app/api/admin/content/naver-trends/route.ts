import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { NAVER_ENABLED, collectNaverTrends } from "@/lib/naver-pipeline";

export const maxDuration = 60;

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("naver_trends")
      .select("id, keyword, source, data, collected_at")
      .order("collected_at", { ascending: false })
      .limit(30);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ trends: data ?? [], naverEnabled: NAVER_ENABLED });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

/** 네이버 트렌드/경쟁 블로그 수동 수집 */
export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!NAVER_ENABLED) {
    return NextResponse.json(
      { message: "NAVER_CLIENT_ID/NAVER_CLIENT_SECRET이 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  try {
    const result = await collectNaverTrends();
    return NextResponse.json({
      message: `${result.collected}개 키워드 수집 완료${result.errors.length ? ` (오류 ${result.errors.length}건)` : ""}`,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "수집 실패" },
      { status: 500 },
    );
  }
}
