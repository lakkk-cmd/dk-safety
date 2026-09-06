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
    const { data: items, error } = await supabase
      .from("report_action_items")
      .select("id, report_id, swot_analysis_id, content, done, done_at, note, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    // 액션아이템은 두 출처(주간 경영진 보고서 / SWOT·TOWS 분기 분석) 중 하나에서 오므로
    // 라벨도 두 테이블 중 실제로 채워진 쪽에서 조회한다(120_swot_analysis.sql 참고).
    const reportIds = [...new Set((items ?? []).map((i) => i.report_id).filter(Boolean))];
    const swotIds = [...new Set((items ?? []).map((i) => i.swot_analysis_id).filter(Boolean))];
    const [reportsRes, swotRes] = await Promise.all([
      reportIds.length
        ? supabase.from("agent_reports").select("id, date_label").in("id", reportIds)
        : Promise.resolve({ data: [] as { id: string; date_label: string }[] }),
      swotIds.length
        ? supabase.from("swot_analyses").select("id, quarter_label").in("id", swotIds)
        : Promise.resolve({ data: [] as { id: string; quarter_label: string }[] }),
    ]);
    const dateLabelById = Object.fromEntries((reportsRes.data ?? []).map((r) => [r.id, r.date_label]));
    const quarterLabelById = Object.fromEntries((swotRes.data ?? []).map((r) => [r.id, r.quarter_label]));

    const enriched = (items ?? []).map((i) => ({
      ...i,
      report_date_label: i.report_id
        ? dateLabelById[i.report_id]
          ? `${dateLabelById[i.report_id]} 보고서`
          : null
        : i.swot_analysis_id
          ? `SWOT ${quarterLabelById[i.swot_analysis_id] ?? ""} 분석`.trim()
          : null,
    }));
    return NextResponse.json({ items: enriched });
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

  const body = (await request.json()) as { id?: string; done?: boolean; note?: string };
  if (!body.id || (typeof body.done !== "boolean" && typeof body.note !== "string")) {
    return NextResponse.json({ message: "id와 done 또는 note 파라미터 필요" }, { status: 400 });
  }
  if (typeof body.note === "string" && body.note.length > 2000) {
    return NextResponse.json({ message: "메모는 2000자 이하로 입력해 주세요." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.done === "boolean") {
    update.done = body.done;
    update.done_at = body.done ? new Date().toISOString() : null;
  }
  if (typeof body.note === "string") {
    update.note = body.note.trim() || null;
  }

  try {
    const supabase = requireAgentSupabase();
    const { error } = await supabase.from("report_action_items").update(update).eq("id", body.id);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ message: "저장되었습니다." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "처리 실패" },
      { status: 500 },
    );
  }
}
