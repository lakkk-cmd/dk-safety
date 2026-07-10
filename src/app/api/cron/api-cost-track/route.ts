import { NextResponse } from "next/server";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { notifyPipelineFailure } from "@/lib/kakao-publish";

export const maxDuration = 30;

const PIPELINE = "api-cost-track";
const MEMORY_KEY = "openrouter_usage_last_total_usd";
// 참고용 근사 환율 — 실제 결제 환율과 다를 수 있음. 정확한 금액이 필요하면 이 값 대신
// 카드 명세서 기준으로 직접 수정할 것.
const USD_TO_KRW = 1350;

/**
 * OpenRouter는 credits 엔드포인트로 누적 사용액(USD)을 바로 제공한다 — 다른 공급자
 * (Anthropic/Gemini/Voyage/Solapi)는 이런 단순 API 키 기반 사용량 조회가 없어서 이번엔
 * OpenRouter만 자동화한다. 지난 실행 이후 증가분만 계산해 expenses에 남긴다.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json({ success: false, error: "OPENROUTER_API_KEY 미설정" }, { status: 500 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json(
      { success: false, error: "Supabase URL 또는 SUPABASE_SERVICE_ROLE_KEY 미설정" },
      { status: 500 },
    );
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    });
    if (!res.ok) throw new Error(`OpenRouter credits API ${res.status}`);
    const json = (await res.json()) as { data?: { total_usage?: number } };
    const totalUsage = json.data?.total_usage;
    if (typeof totalUsage !== "number") throw new Error("OpenRouter 응답에 total_usage 없음");

    const supabase = requireAgentSupabase();
    const { data: mem } = await supabase.from("agent_memory").select("content").eq("key", MEMORY_KEY).maybeSingle();
    const lastTotal = mem?.content ? Number(mem.content) : 0;
    const deltaUsd = totalUsage - lastTotal;

    let logged = false;
    if (deltaUsd > 0.01) {
      const krw = Math.max(1, Math.round(deltaUsd * USD_TO_KRW));
      const { error: insertError } = await supabase.from("expenses").insert({
        category: "API비용",
        amount: krw,
        description: `OpenRouter API 사용료 자동집계 (누적 $${totalUsage.toFixed(2)} 중 이번 구간 $${deltaUsd.toFixed(2)}, 참고 환율 ${USD_TO_KRW})`,
        payment_method: "카드",
      });
      if (insertError) throw insertError;

      await supabase
        .from("agent_memory")
        .upsert({ key: MEMORY_KEY, content: String(totalUsage), updated_at: new Date().toISOString() });
      logged = true;
    }

    return NextResponse.json({ success: true, pipeline: PIPELINE, totalUsageUsd: totalUsage, deltaUsd, logged });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notifyPipelineFailure(PIPELINE, message).catch(() => {});
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
