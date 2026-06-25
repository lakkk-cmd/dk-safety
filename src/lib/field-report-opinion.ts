/** 세대 점검 계측값 + KEC 지식베이스 RAG → 임대인/거주자용 AI 소견 생성 */

import { callClaudeCustom } from "@/lib/agents";
import { searchKnowledgeBase } from "@/lib/knowledge-base";
import { searchKnowledgeChunks } from "@/lib/knowledge-chunks-search";
import type { FieldReport } from "@/lib/field-reports";

const SYSTEM_PROMPT = `당신은 전기기사 자격을 보유한 전기안전 전문가입니다.
세대 점검 계측 데이터와 한국전기설비규정(KEC)을 바탕으로
두 가지 진단 소견을 작성합니다.
반드시 KEC 조항 번호를 명시하고, 측정값과 정상기준을 비교하여
구체적인 근거를 제시하세요.

[임대인(집주인)용 소견]
- 전문 기술 용어 사용
- KEC 조항 번호 명시 (예: "KEC 234에 따라...")
- 법적 의무 이행 여부 섹션 포함
- 교체 필요 부품 목록 + 예상 비용 범위
- A4 1페이지 분량

[거주자(세입자)용 소견]
- 비전문가 친화적 (중학생도 이해 가능한 수준)
- 위험도 색상 표현 (안전=초록/주의=노랑/경고=주황/위험=빨강)
- 지금 당장 해야 할 행동 3가지 요약
- A4 반 페이지 분량

[위험등급별 어조]
- 안전: "점검 결과 이상 없음을 확인하였습니다"
- 주의: "경미한 이상이 감지되어 지속적인 관찰을 권고드립니다"
- 경고: "조속한 조치가 필요한 이상이 발견되었습니다"
- 위험: "즉시 사용 중단 및 교체가 필요한 심각한 이상이 발견되었습니다"

반드시 아래 형식을 정확히 지켜 출력하세요. 다른 텍스트나 설명을 추가하지 마세요.

===LANDLORD_OPINION===
(임대인용 소견 전체 본문)
===RESIDENT_OPINION===
(거주자용 소견 전체 본문)`;

function buildKnowledgeQuery(report: FieldReport): string {
  return [
    `누전여부 ${report.leakageDetected ? "발생" : "미발생"}`,
    report.insulationResistanceMohm != null ? `절연저항값 ${report.insulationResistanceMohm}MΩ` : null,
    report.breakerTripCurrentMa != null ? `누전차단기 동작전류 ${report.breakerTripCurrentMa}mA` : null,
    report.breakerVisualStatus ? `차단기상태 ${report.breakerVisualStatus}` : null,
    report.breakerYear != null ? `차단기 제조연도 ${report.breakerYear}` : null,
    report.groundingStatus ? `접지상태 ${report.groundingStatus}` : null,
    report.riskLevel ? `위험등급 ${report.riskLevel}` : null
  ]
    .filter(Boolean)
    .join(" ");
}

function buildUserPrompt(report: FieldReport, kbContext: string, chunkContext: string): string {
  const lines = [
    `세대 주소: ${report.apartmentAddress}`,
    `점검일시: ${report.inspectedAt}`,
    "",
    "[분전반 계측값]",
    `누전차단기 동작 전류: ${report.breakerTripCurrentMa != null ? `${report.breakerTripCurrentMa}mA` : "측정안함"} (정상범위: 30mA 이하)`,
    `주 차단기 용량: ${report.mainBreakerCapacityA != null ? `${report.mainBreakerCapacityA}A` : "측정안함"}`,
    `절연저항값: ${report.insulationResistanceMohm != null ? `${report.insulationResistanceMohm}MΩ` : "측정안함"} (정상범위: 1MΩ 이상)`,
    `누전 발생 여부: ${report.leakageDetected ? "YES" : "NO"}`,
    report.leakageDetected ? `누전 추정 경로: ${report.leakagePathNote || "미기록"}` : null,
    "",
    "[차단기 상태]",
    `제조연도: ${report.breakerYear ?? "미기록"}`,
    `육안 상태: ${report.breakerVisualStatus ?? "미기록"}`,
    "",
    "[콘센트/배선 상태]",
    `전용면적: ${report.unitAreaSqm != null ? `${report.unitAreaSqm}㎡` : "미기록"}`,
    `콘센트 과열 여부: ${report.outletOverheat ? `YES (${report.outletOverheatNote || "메모 없음"})` : "NO"}`,
    `배선 노출/손상 여부: ${report.wiringDamage ? `YES (${report.wiringDamageNote || "메모 없음"})` : "NO"}`,
    `접지 연결 상태: ${report.groundingStatus ?? "미기록"}`,
    "",
    "[종합 위험도 — 기술자 판단]",
    `위험등급: ${report.riskLevel ?? "미기록"}`,
    `긴급 교체 필요 부품: ${report.urgentParts.length > 0 ? report.urgentParts.join(", ") : "없음"}`,
    `현장 메모: ${report.siteMemo || "없음"}`,
    "",
    kbContext || "[지식베이스 관련 정보]\n관련 KEC 조항을 찾지 못했습니다. 일반적인 전기안전 상식에 근거해 작성하세요.",
    chunkContext || null
  ];
  return lines.filter((line) => line !== null).join("\n");
}

function splitOpinion(raw: string): { landlord: string; resident: string } {
  const landlordMarker = "===LANDLORD_OPINION===";
  const residentMarker = "===RESIDENT_OPINION===";
  const landlordIdx = raw.indexOf(landlordMarker);
  const residentIdx = raw.indexOf(residentMarker);
  if (landlordIdx === -1 || residentIdx === -1 || residentIdx < landlordIdx) {
    return { landlord: raw.trim(), resident: raw.trim() };
  }
  const landlord = raw.slice(landlordIdx + landlordMarker.length, residentIdx).trim();
  const resident = raw.slice(residentIdx + residentMarker.length).trim();
  return { landlord, resident };
}

export async function generateFieldReportOpinion(report: FieldReport): Promise<{ landlord: string; resident: string }> {
  const knowledgeQuery = buildKnowledgeQuery(report);
  const [kbContext, chunkContext] = await Promise.all([
    searchKnowledgeBase(knowledgeQuery, 5),
    searchKnowledgeChunks(knowledgeQuery, 5).catch(() => "")
  ]);
  const userPrompt = buildUserPrompt(report, kbContext, chunkContext);
  const raw = await callClaudeCustom(SYSTEM_PROMPT, userPrompt, 6000, 110_000);
  return splitOpinion(raw);
}
