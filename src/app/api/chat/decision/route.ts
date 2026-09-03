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
  const applied: { key: string; prev_value: string; new_value: string; target_page: string }[] = [];
  const warnings: string[] = [];

  for (const decision of decisions) {
    const { decision_type, target_page, key, value, label } = decision;

    // 디렉터 파이프라인 재편(Phase 3) — 가격 변경은 §5 블랙리스트("항상 사람 승인, 예외 없음")
    // 대상이라 이 API로는 절대 즉시 반영하지 않는다. 실제 청구액의 단일 출처는 /admin/pricing
    // (payment_settings/pricing_catalog/service_items)이며, 대표님이 거기서 직접 반영해야 한다.
    // 이전엔 여기서 site_config를 즉시 UPSERT하고 payment_settings까지 동기화해버려서,
    // "확정 요금 체계는 대장 승인 없이 변경 금지"라는 정책과 코드가 정면으로 모순돼 있었다.
    if (decision_type === "pricing") {
      warnings.push(
        `${key}: 가격 변경은 채팅에서 자동 반영되지 않습니다. /admin/pricing에서 대표님이 직접 반영해주세요. (요청된 값: ${value})`,
      );
      continue;
    }

    // 히어로 타이틀/서브타이틀/CTA는 상시 고정 카피로 코드에 박아뒀다(home-client.tsx) — 이슈마다
    // 여러 필드를 손보던 것을 season_banner 하나로 통합한 재구성(2026-09)이라, 이 키들은 site_config에
    // 써봤자 화면에 반영되지 않는다. 조용히 성공한 척 하지 않고 여기서 명확히 거부한다.
    if (key === "hero_title" || key === "hero_subtitle" || key === "hero_cta") {
      warnings.push(
        `${key}: 히어로 문구는 상시 고정 카피라 채팅으로 반영되지 않습니다. 계절/이슈성 안내는 season_banner_text로 등록해주세요. (영구적인 카피 변경이 필요하면 코드 수정 요청이 필요합니다)`,
      );
      continue;
    }

    // site_decisions INSERT + site_config UPSERT(+실패 시 롤백)를 단일 DB 함수 호출로 묶어
    // 원자적으로 처리한다 (마이그레이션 059) — 예전에는 4개의 별도 요청으로 나뉘어 있어
    // 롤백 단계 자체가 중간에 실패하면 두 테이블 상태가 어긋날 수 있었다.
    const { data: rpcData, error: rpcError } = await supabase.rpc("apply_site_decision", {
      p_session_id: session_id,
      p_decision_type: decision_type,
      p_target_page: target_page,
      p_key: key,
      p_value: value,
      p_label: label ?? null,
    });

    if (rpcError) {
      return NextResponse.json({ error: `결정 저장 실패: ${rpcError.message}` }, { status: 500 });
    }

    const result = (
      rpcData as { id: string; prev_value: string; status: string; error_message: string | null }[]
    )[0];
    if (!result || result.status !== "applied") {
      return NextResponse.json(
        { error: `설정 저장 실패: ${result?.error_message ?? "알 수 없는 오류"}` },
        { status: 500 },
      );
    }

    const prev_value = result.prev_value;
    applied.push({ key, prev_value, new_value: value, target_page });
  }

  return NextResponse.json({ success: true, applied, applied_count: applied.length, warnings });
}
