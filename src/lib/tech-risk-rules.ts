/**
 * 디렉터 파이프라인 재편(Phase 2) — §5 "항상 사람 승인" 블랙리스트를 코드 규칙으로 강제한다.
 * Full 에이전트(총괄)가 github_create_issue(auto_implement=true)를 스스로 요청해도, 아래
 * 패턴에 해당하는 이슈라면 총괄디렉터가 무조건 사람 검토(false)로 되돌린다 — LLM의 자기
 * 판단에만 기대지 않기 위함. 정규식은 일부러 넓게 잡았다: 과도하게 걸려도(false positive)
 * 결과는 "사람이 한 번 더 본다"일 뿐이라 안전한 방향이고, 놓치는 것(false negative)이 훨씬
 * 위험하다.
 */

const ALWAYS_HUMAN_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "가격/결제/정산", pattern: /가격|요금|결제|정산|환불|price|payment|billing|settlement|refund/i },
  { label: "인증/권한", pattern: /인증|권한|비밀번호|세션|로그인|auth|permission|password|session|login|cookie/i },
  { label: "DB 스키마/마이그레이션", pattern: /스키마|마이그레이션|migration|schema|alter table|drop table|supabase\/migrations/i },
  { label: "데이터 삭제", pattern: /데이터\s*삭제|delete from|drop table|truncate/i },
  { label: "알림/발송 트리거", pattern: /알림톡|카카오\s*(발송|전송|메모)|문자\s*발송|sms|알림\s*발송|notification|kakao-publish|solapi/i },
  { label: "외부 API 연동", pattern: /외부\s*api|external api|oauth|webhook|서드파티|third-party|새로운\s*api\s*키/i },
  { label: "공개 콘텐츠 발행", pattern: /발행|publish|업로드|upload|content-pipeline/i },
];

export type TechRiskClassification = {
  forcedHuman: boolean;
  matchedLabels: string[];
};

/** 이슈 제목+본문을 블랙리스트 정규식으로 스캔한다. 하나라도 걸리면 forcedHuman=true. */
export function classifyTechRisk(title: string, body: string): TechRiskClassification {
  const text = `${title}\n${body}`;
  const matchedLabels = ALWAYS_HUMAN_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.label);
  return { forcedHuman: matchedLabels.length > 0, matchedLabels };
}

/** 자동구현 이슈 본문에 심어 GitHub Actions 워크플로우가 파싱할 수 있게 하는 마커 */
export const CHAT_WHITELIST_MARKER = "<!-- risk-tier: chat-whitelist -->";
