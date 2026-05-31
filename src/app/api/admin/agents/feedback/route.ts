import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

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
      .from("boss_feedback")
      .select("id, content, status, created_at, applied_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ feedback: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  let body: { content?: string } = {};
  try {
    body = (await request.json()) as { content?: string };
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const content = String(body.content ?? "").trim();
  if (!content || content.length < 4) {
    return NextResponse.json({ message: "피드백은 4자 이상 입력해 주세요." }, { status: 400 });
  }
  if (content.length > 8000) {
    return NextResponse.json({ message: "피드백은 8000자 이하로 입력해 주세요." }, { status: 400 });
  }
  try {
    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("boss_feedback")
      .insert({ content, status: "pending" })
      .select("id, content, status, created_at, applied_at")
      .single();
    if (error || !data) {
      return NextResponse.json({ message: error?.message ?? "저장 실패" }, { status: 500 });
    }
    return NextResponse.json({ feedback: data });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "저장 실패" },
      { status: 500 },
    );
  }
}
