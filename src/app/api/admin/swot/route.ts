import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { getLatestSwotAnalysis, runSwotAnalysis } from "@/lib/swot-analysis";

export const maxDuration = 180;

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const analysis = await getLatestSwotAnalysis();
    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

/** 관리자 화면의 "지금 재생성" 버튼 — 분기 자동 크론과 별개로 언제든 수동 재생성 가능하게 한다. */
export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ message: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const analysis = await runSwotAnalysis();
    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "생성 실패" },
      { status: 500 },
    );
  }
}
