import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireAgentSupabase } from "@/lib/agent-db";
import { readPricingCatalog, updatePricingCatalog } from "@/lib/pricing-catalog";

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
  const warnings: string[] = [];

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

    // ⑤ pricing 결정은 site_config(AI 참고용 정보)만으로는 실제 예약/결제 화면에 반영되지 않는다.
    // 진짜 반영 대상은 payment_settings(base_dispatch_fee/pricing_catalog) — pricing-guide-card.tsx가
    // 여기서 읽어 고객에게 보여주고 Toss 결제 금액도 여기서 나온다. 이걸 빠뜨리면 AI가 "적용 완료"라고
    // 보고해도 실제 결제 화면 금액은 그대로인 상태가 된다 (실제로 발생했던 버그).
    if (decision_type === "pricing" && (key === "basic_price" || key === "full_price")) {
      const amount = Number(value);
      if (!Number.isFinite(amount)) {
        warnings.push(`${key}: 금액을 숫자로 해석할 수 없어 실제 결제 화면(payment_settings)에는 반영하지 못했습니다. site_config에만 기록됨.`);
      } else {
        try {
          const catalog = await readPricingCatalog();
          const catalogKey = key === "basic_price" ? "base_dispatch" : "full_package";
          const exists = catalog.some((line) => line.key === catalogKey);
          const nextCatalog = exists
            ? catalog.map((line) => (line.key === catalogKey ? { ...line, amount } : line))
            : [
                ...catalog,
                {
                  key: catalogKey,
                  title: key === "basic_price" ? "기본 출장점검" : "풀패키지",
                  amount,
                  detail: "",
                },
              ];
          await updatePricingCatalog(nextCatalog);
        } catch (syncErr) {
          warnings.push(
            `${key}: 실제 결제 화면(payment_settings) 동기화 실패 — ${syncErr instanceof Error ? syncErr.message : String(syncErr)}. site_config에는 기록됐지만 고객이 보는 결제 금액은 아직 바뀌지 않았을 수 있습니다.`,
          );
        }
      }
    }
  }

  return NextResponse.json({ success: true, applied, applied_count: applied.length, warnings });
}
