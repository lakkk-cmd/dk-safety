/**
 * 자문단(CSO/COO/CFO/CLO) 검증 게이트 — Gemini 교차검증(cross-validate.ts)과는 다른 축.
 * Gemini는 독립된 모델의 사실확인/안전성 검증이고, 여기는 대경이엔피 사업 맥락에 특화된
 * 자문단 페르소나(agents.ts SYSTEM_PROMPTS)의 업무 판단을 추가 검증으로 쓴다 — 대체가
 * 아니라 보완. (디렉터 파이프라인 확장, 2026-08)
 *
 * 하드 블록(발행/생성 자체를 막음): 콘텐츠 발행(CLO), 견적서·계약서(CLO+CFO), 경비/청구서(CFO)
 * 소프트 경고(막지 않고 참고 메모만): 작업자 배정·콘텐츠 작업 등록(COO), 콘텐츠 전략 정합성(CSO)
 * — 되돌리기 어렵거나 대외 문서로 나가는 건 하드 블록, 운영·전략처럼 원래 재량 영역인 건 경고만.
 */

import { callClaude, isNoConcernVerdict } from "@/lib/agents";

export type AdvisoryConcern = { concern: string | null };

const NO_CONCERN: AdvisoryConcern = { concern: null };

async function askAdvisor(
  agentId: "cso" | "coo" | "cfo" | "clo",
  prompt: string,
  maxTokens = 200,
): Promise<AdvisoryConcern> {
  try {
    const raw = (await callClaude(agentId, prompt, maxTokens)).trim();
    return { concern: isNoConcernVerdict(raw) ? null : raw };
  } catch {
    // 검증 자체가 실패하면(레이트리밋 등) 본 작업을 막지 않는다 — 안전장치 부재보다는
    // 검증 없이 기존 동작을 유지하는 편이 낫다(기존 verifyContentBriefWithMarketer와 동일 방침).
    return NO_CONCERN;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. CLO — 콘텐츠 발행 전 법적 리스크 (하드 블록)
// ══════════════════════════════════════════════════════════════════════════════

export async function verifyContentLegalRisk(
  title: string,
  content: string,
  contentType: "youtube" | "kakao" | "blog",
): Promise<AdvisoryConcern> {
  const prompt = `다음은 발행 직전 ${contentType === "youtube" ? "유튜브 스크립트" : contentType === "kakao" ? "카카오 채널 포스트" : "블로그 글"}이다.

제목: ${title}
내용: ${content.slice(0, 2000)}

법무총괄 관점에서 검토하라: 무자격시공으로 오인될 소지, 과장·허위 안전 주장, 겸업금지·전기공사업법
위반 소지, 실제로 보유하지 않은 자격/인증을 보유한 것처럼 암시하는 표현이 있는지만 본다. 명백한
문제가 있을 때만 1~2문장으로 지적하고, 없으면 정확히 "이상없음"이라고만 답하라.`;
  return askAdvisor("clo", prompt, 200);
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. CFO — 경비/청구서 재무 타당성 (하드 블록, 기존 Gemini 검증에 추가)
// ══════════════════════════════════════════════════════════════════════════════

export async function verifyExpenseWithCFO(
  category: string,
  amount: number,
  description: string | null,
): Promise<AdvisoryConcern> {
  const prompt = `다음 경비 입력을 재무총괄 관점에서 검토하라.

카테고리: ${category}
금액: ${amount.toLocaleString()}원
설명: ${description ?? "(없음)"}

1인 전기설비업체(대경이엔피)의 현재 사업 규모·현금흐름에 비춰 이 금액/카테고리가 비정상적으로
크거나 반복적으로 발생하면 문제가 될 만한 패턴인지만 본다. 단순 반복 소모품 구매 등은 정상이다.
명백히 이상할 때만 1~2문장으로 지적하고, 없으면 정확히 "이상없음"이라고만 답하라.`;
  return askAdvisor("cfo", prompt, 200);
}

export async function verifyInvoiceWithCFO(
  customerName: string,
  items: { description: string; qty: number; unit_price: number; amount: number }[],
  total: number,
): Promise<AdvisoryConcern> {
  const itemsText = items.map((i) => `- ${i.description}: ${i.qty}개 × ${i.unit_price.toLocaleString()}원`).join("\n");
  const prompt = `다음 청구서를 재무총괄 관점에서 검토하라.

고객명: ${customerName}
품목:
${itemsText}
합계: ${total.toLocaleString()}원

대경이엔피의 확정 요금 체계(기본 출장점검 150,000원, 풀패키지 200,000원, 추가작업은 현장 견적)에
비춰 금액이 비정상적으로 벗어나 보이는지만 본다. 명백히 이상할 때만 1~2문장으로 지적하고, 없으면
정확히 "이상없음"이라고만 답하라.`;
  return askAdvisor("cfo", prompt, 200);
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. COO — 작업자 배정·콘텐츠 작업 등록 실현가능성 (소프트 경고, 막지 않음)
// ══════════════════════════════════════════════════════════════════════════════

export async function checkWorkerAssignmentWithCOO(
  workerName: string,
  scheduledAt: string,
  sameDayCount: number,
): Promise<AdvisoryConcern> {
  const prompt = `다음 작업자 배정을 운영총괄 관점에서 검토하라.

작업자: ${workerName}
배정 일시: ${scheduledAt}
해당 작업자의 당일 기존 배정 건수: ${sameDayCount}건 (이 건 포함 전)

1인/소수 인력 운영 현실에서 과부하로 품질 저하나 지각이 우려되는 수준인지만 본다(이미 5건 이상은
시스템이 자동 차단하므로 그 이하 범위에서의 판단). 우려되면 1문장으로 짚고, 없으면 정확히
"이상없음"이라고만 답하라. 이건 참고용 경고일 뿐 배정을 막지 않는다.`;
  return askAdvisor("coo", prompt, 150);
}

export async function checkContentJobLoadWithCOO(
  jobType: "video" | "blog",
  topic: string,
  activeJobCount: number,
): Promise<AdvisoryConcern> {
  const prompt = `다음 콘텐츠 제작 작업 등록을 운영총괄 관점에서 검토하라.

작업 유형: ${jobType === "video" ? "영상" : "블로그"}
주제: ${topic}
현재 처리 중/대기 중인 같은 유형 작업 수(이 건 포함): ${activeJobCount}건

1인 사업자가 본업을 병행하며 승인·검토할 수 있는 현실적인 양인지만 본다. 대기 작업이 과도하게
쌓여 있어 승인 없이 방치될 우려가 크면 1문장으로 짚고, 없으면 정확히 "이상없음"이라고만 답하라.
이건 참고용 경고일 뿐 등록을 막지 않는다.`;
  return askAdvisor("coo", prompt, 150);
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. CSO — 콘텐츠 디렉터 브리핑 전략 정합성 (소프트, 마케터 참고 메모)
// ══════════════════════════════════════════════════════════════════════════════

export async function checkStrategyAlignmentWithCSO(
  priorities: string,
  weekFocus: string,
  roadmapMessage?: string,
): Promise<AdvisoryConcern> {
  const prompt = `총괄디렉터가 이번 주 콘텐츠 우선순위를 다음과 같이 정리했다.

우선순위: ${priorities || "(없음)"}
이번 주 집중 방향: ${weekFocus || "(없음)"}
${roadmapMessage ? `현재 로드맵: ${roadmapMessage}` : ""}

전략총괄 관점에서, 이게 현재 로드맵 집중과제와 방향이 맞는지만 본다. 명백히 어긋나 보이면 1~2문장
으로 짚고, 없으면 정확히 "이상없음"이라고만 답하라. 이건 마케터(CMO) 참고용 메모일 뿐 브리핑
생성을 막지 않는다.`;
  return askAdvisor("cso", prompt, 200);
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. CLO+CFO — 견적서·계약서 문서 검증 (하드 블록)
// ══════════════════════════════════════════════════════════════════════════════

/** generate_document로 만든 견적서/계약서 등을 CLO(계약조건)+CFO(금액)가 병렬 검토한다 */
export async function verifyDocumentWithCLOandCFO(
  docTitle: string,
  content: string,
): Promise<AdvisoryConcern> {
  const clNPrompt = `다음은 대경이엔피가 고객에게 발급하려는 문서 초안이다.

문서 종류: ${docTitle}
내용: ${content.slice(0, 2500)}

법무총괄 관점에서, 계약 조건·보증 범위·특약사항이 겸업금지·전기공사업법 등 사업 정책과 모순되지
않는지만 본다. 명백한 문제가 있을 때만 1~2문장으로 지적하고, 없으면 정확히 "이상없음"이라고만
답하라.`;
  const cfoPrompt = `다음은 대경이엔피가 고객에게 발급하려는 문서 초안이다.

문서 종류: ${docTitle}
내용: ${content.slice(0, 2500)}

재무총괄 관점에서, 문서에 적힌 금액이 대경이엔피의 확정 요금 체계(기본 출장점검 150,000원,
풀패키지 200,000원, 추가작업은 현장 견적)와 명백히 어긋나 보이는지만 본다. 금액이 아예 없거나
"[확인 필요]"로 표시된 경우는 문제가 아니다. 명백히 이상할 때만 1~2문장으로 지적하고, 없으면
정확히 "이상없음"이라고만 답하라.`;

  const [clo, cfo] = await Promise.all([
    askAdvisor("clo", clNPrompt, 200),
    askAdvisor("cfo", cfoPrompt, 200),
  ]);

  const concerns = [clo.concern, cfo.concern].filter((c): c is string => Boolean(c));
  if (concerns.length === 0) return NO_CONCERN;
  return { concern: concerns.join(" / ") };
}
