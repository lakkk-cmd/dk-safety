import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireAgentSupabase } from "@/lib/agent-db";

type DecisionInput = {
  decision_type: "pricing" | "cta" | "notice" | "service" | "content" | "booking";
  target_page: "main" | "service" | "booking" | "content" | "all";
  key: string;
  value: string;
  label?: string;
};

type DecisionBody = {
  session_id: string;
  decisions: DecisionInput[];
};

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  let body: DecisionBody;
  try {
    body = (await request.json()) as DecisionBody;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { session_id, decisions } = body;
  if (!session_id) {
    return NextResponse.json({ error: "session_id가 필요합니다." }, { status: 400 });
  }
  if (!Array.isArray(decisions) || decisions.length === 0) {
    return NextResponse.json({ error: "decisions 배열이 비어있습니다." }, { status: 400 });
  }

  const supabase = requireAgentSupabase();
  const now = new Date().toISOString();
  const applied: { key: string; prev_value: string; new_value: string; target_page: string }[] = [];

  for (const decision of decisions) {
    const { decision_type, target_page, key, value, label } = decision;

    // ① 현재 값 조회
    const { data: existing } = await supabase
      .from("site_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const prev_value = (existing as { value: string } | null)?.value ?? "";

    // ② site_decisions INSERT
    const { data: decRow, error: decErr } = await supabase
      .from("site_decisions")
      .insert({
        session_id,
        decision_type,
        target_page,
        key,
        value,
        prev_value,
        label: label ?? null,
        status: "pending",
        boss_confirmed: false,
      })
      .select("id")
      .single();

    if (decErr) {
      return NextResponse.json({ error: `결정 저장 실패: ${decErr.message}` }, { status: 500 });
    }

    const decisionId = (decRow as { id: number }).id;

    // ③ site_config UPSERT
    const { error: configErr } = await supabase.from("site_config").upsert(
      { key, value, updated_at: now, updated_by: "boss" },
      { onConflict: "key" },
    );

    if (configErr) {
      // 롤백 — site_config 복구
      if (prev_value) {
        await supabase
          .from("site_config")
          .update({ value: prev_value, updated_at: now, updated_by: "rollback" })
          .eq("key", key);
      }
      // site_decisions 상태 failed로
      await supabase
        .from("site_decisions")
        .update({ status: "failed" })
        .eq("id", decisionId);
      return NextResponse.json({ error: `설정 저장 실패: ${configErr.message}` }, { status: 500 });
    }

    // ④ status → applied
    await supabase
      .from("site_decisions")
      .update({ status: "applied", applied_at: now })
      .eq("id", decisionId);

    applied.push({ key, prev_value, new_value: value, target_page });
  }

  return NextResponse.json({ success: true, applied, applied_count: applied.length });
}
