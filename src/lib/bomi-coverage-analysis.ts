// 증권 스캔 이미지 → Claude Vision OCR → 표준 보장 카테고리 대비 과부족 진단.
// 규제 경계: 특정 보험사·상품을 추천하지 않는다 — "증권에 실제로 적힌 내용 정리 + 일반적
// 수준 안내"까지만 하는 정보 정리 툴로 포지셔닝한다(설계안 06번 모집행위 리스크 항목 참고).
import { callClaudeRich, extractJsonBlock } from "@/lib/agents";

export const STANDARD_COVERAGE_CATEGORIES = [
  "사망",
  "암",
  "뇌혈관질환",
  "심혈관질환",
  "실손의료비",
  "후유장해",
  "입원일당",
  "수술비",
] as const;

export type CoverageGapLevel = "부족" | "보통" | "충분" | "확인불가";

export type PolicyAnalysisResult = {
  insurer: string;
  productName: string;
  contractDate: string | null;
  premiumAmount: number | null;
  paymentCycle: string;
  categoryCoverage: Record<string, { amount: number | null; note: string }>;
  gaps: Array<{ category: string; level: CoverageGapLevel; note: string }>;
  summary: string;
};

const SYSTEM_PROMPT =
  "당신은 보험설계사의 업무를 돕는 보장분석 보조 도구입니다. 증권 이미지를 읽고 실제로 적힌 " +
  "내용만 근거로 정리합니다. 특정 보험사나 상품을 추천하거나 가입을 권유하지 않습니다 — " +
  "설계사가 상담에서 참고할 '정리 자료'를 만드는 것이 목적입니다. 이미지에서 읽을 수 없거나 " +
  "불확실한 값은 절대 추측하지 말고 null 또는 '확인불가'로 표시하세요. 응답은 요청한 JSON " +
  "형식 하나만 출력하고 다른 설명은 덧붙이지 마세요.";

function buildUserPrompt(): string {
  const categories = STANDARD_COVERAGE_CATEGORIES.join(", ");
  return (
    `아래 증권 이미지를 읽고 다음 JSON 형식으로만 답하세요.\n\n` +
    `표준 보장 카테고리(참고용, 증권에 없는 항목은 categoryCoverage에서 amount:null로 둘 것): ${categories}\n\n` +
    `{\n` +
    `  "insurer": "보험사명 (읽을 수 없으면 빈 문자열)",\n` +
    `  "productName": "상품명 (읽을 수 없으면 빈 문자열)",\n` +
    `  "contractDate": "YYYY-MM-DD 또는 null",\n` +
    `  "premiumAmount": 월 보험료 숫자(원) 또는 null,\n` +
    `  "paymentCycle": "납입주기 (예: 월납, 없으면 빈 문자열)",\n` +
    `  "categoryCoverage": {\n` +
    `    "카테고리명": { "amount": 가입금액 숫자(원) 또는 null, "note": "증권에 적힌 원문 표현 그대로" }\n` +
    `  },\n` +
    `  "gaps": [\n` +
    `    { "category": "카테고리명", "level": "부족|보통|충분|확인불가", "note": "왜 그렇게 판단했는지 1문장" }\n` +
    `  ],\n` +
    `  "summary": "설계사가 고객에게 그대로 설명할 수 있는 2~3문장 한국어 요약 (특정 상품 추천 금지)"\n` +
    `}`
  );
}

export async function analyzeInsurancePolicyImage(imageUrl: string): Promise<PolicyAnalysisResult> {
  const reply = await callClaudeRich({
    systemPrompt: SYSTEM_PROMPT,
    userContent: [
      { type: "image", source: { type: "url", url: imageUrl } },
      { type: "text", text: buildUserPrompt() },
    ],
    maxTokens: 2000,
    timeoutMs: 90_000,
  });

  const jsonText = extractJsonBlock(reply);
  if (!jsonText) {
    throw new Error("증권 분석 응답에서 JSON을 찾지 못했습니다.");
  }

  const parsed = JSON.parse(jsonText) as Partial<PolicyAnalysisResult>;
  return {
    insurer: parsed.insurer ?? "",
    productName: parsed.productName ?? "",
    contractDate: parsed.contractDate ?? null,
    premiumAmount: typeof parsed.premiumAmount === "number" ? parsed.premiumAmount : null,
    paymentCycle: parsed.paymentCycle ?? "",
    categoryCoverage: parsed.categoryCoverage ?? {},
    gaps: parsed.gaps ?? [],
    summary: parsed.summary ?? "",
  };
}
