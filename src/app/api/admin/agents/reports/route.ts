import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const limit = Math.min(30, Math.max(1, Number(searchParams.get("limit") ?? 10) || 10));

  try {
    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("agent_reports")
      .select("id, created_at, date_label, chief_summary, feedback_applied, sections")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ reports: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}
