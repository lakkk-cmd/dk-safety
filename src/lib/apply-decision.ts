import { requireAgentSupabase } from "@/lib/agent-db";

export type DecisionItem = {
  decision_type: "pricing" | "cta" | "notice" | "service" | "content" | "booking";
  target_page: "main" | "service" | "booking" | "content" | "all";
  key: string;
  value: string;
  label?: string;
};

export type ApplyResult = {
  success: boolean;
  applied: { key: string; prev_value: string; new_value: string; target_page: string }[];
  applied_count: number;
  error?: string;
};

/** 풀 에이전트가 대화에서 결정을 감지했을 때 site_config에 직접 반영 */
export async function applyDecision(
  decisions: DecisionItem[],
  session_id: string,
): Promise<ApplyResult> {
  if (!decisions.length) {
    return { success: false, applied: [], applied_count: 0, error: "decisions 배열이 비어있습니다." };
  }

  const supabase = requireAgentSupabase();
  const now = new Date().toISOString();
  const applied: ApplyResult["applied"] = [];

  for (const { decision_type, target_page, key, value, label } of decisions) {
    const { data: existing } = await supabase
      .from("site_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const prev_value = (existing as { value: string } | null)?.value ?? "";

    const { data: decRow, error: decErr } = await supabase
      .from("site_decisions")
      .insert({ session_id, decision_type, target_page, key, value, prev_value, label: label ?? null, status: "pending", boss_confirmed: false })
      .select("id")
      .single();
    if (decErr) return { success: false, applied, applied_count: applied.length, error: decErr.message };

    const decisionId = (decRow as { id: number }).id;

    const { error: configErr } = await supabase
      .from("site_config")
      .upsert({ key, value, updated_at: now, updated_by: "agent" }, { onConflict: "key" });

    if (configErr) {
      if (prev_value) {
        await supabase.from("site_config").update({ value: prev_value, updated_at: now, updated_by: "rollback" }).eq("key", key);
      }
      await supabase.from("site_decisions").update({ status: "failed" }).eq("id", decisionId);
      return { success: false, applied, applied_count: applied.length, error: configErr.message };
    }

    await supabase.from("site_decisions").update({ status: "applied", applied_at: now }).eq("id", decisionId);
    applied.push({ key, prev_value, new_value: value, target_page });
  }

  return { success: true, applied, applied_count: applied.length };
}
