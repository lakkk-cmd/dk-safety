/**
 * 세대전기점검 "AI 안전진단" 확장판 — 적합은 뭉뚱그려 한 문단, 별표3 부적합만 개별로
 * 이유+방치시 위험+조치를 풀어쓰고, 회사 자체 권장사항(연한초과 등)은 완전히 별도 섹션으로
 * 분리한다(2026-08-26, 대표님 요청 + 실측 검증). 규칙엔진(unit-inspection-rules.ts)이 이미
 * 별표3 부적합(DiagnosisEntry[])과 회사기준(CompanyAdvisoryEntry[])을 분리된 배열로 산출해두므로,
 * 이 함수는 그 두 배열을 구조화된 입력으로 그대로 넘긴다 — 프롬프트 안에서 텍스트로 설명해
 * LLM이 스스로 구분하게 하지 않는다(2026-08-26 세션에서 텍스트 기반 분리도 실제로 작동함을
 * 확인했지만, 구조화 입력이 더 안전한 설계라 이걸 기본으로 채택).
 */

import { callClaudeCustom, extractJsonBlock } from "@/lib/agents";
import { getKstDateTime } from "@/lib/agent-schedule";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { renderUnitInspectionPdf } from "@/lib/document-pdf";
import { uploadUnitInspectionPdfCopies } from "@/lib/unit-inspection-pdf-storage";
import {
  computeGroundingResistanceThreshold,
  computeInsulationResistanceThreshold,
  computeLeakageCurrentThreshold,
  type ChecklistEntry,
  type CompanyAdvisoryEntry,
  type DiagnosisEntry
} from "@/lib/unit-inspection-rules";
import { pgGetUnitInspection, pgSaveUnitInspectionAiDiagnosis, pgSaveUnitInspectionPdfCorrection, sanitizeStoragePathSegment } from "@/lib/unit-inspections";

export type UnitInspectionAiDiagnosis = {
  okSummary: string;
  violations: { item: string; explanation: string }[];
  companyAdvisory: { item: string; explanation: string }[];
  measurements: { item: string; value: string; explanation: string }[];
  summary: string;
  /**
   * 세대 요약·권고(2026-09-22 CEO 승인, 샘플 단계) — 종합총평(summary)과 별도로 짧은 권고
   * 목록을 둔다(2026-09-22, 서비스·제품팀 품질기준안 반영 — SYSTEM_PROMPT/
   * generateUnitInspectionAiDiagnosis에 실제로 연결됨). optional로 둬서 이 필드가 생기기
   * 전에 이미 저장된 레거시 aiDiagnosis 데이터에는 없어도 렌더링이 깨지지 않는다.
   */
  recommendations?: string[];
};

const SYSTEM_PROMPT = `당신은 전기기사 자격을 보유한 전기안전 전문가입니다.
공동주택 세대 전기설비 점검(전기안전관리법 직무고시 별표3 기준) 결과를 전기를 전혀 모르는
입주민도 이해할 수 있는 말로 풀어서 설명합니다.

이 결과는 PDF 2페이지("AI 안전진단 결과 (상세)")에만 실립니다. **공식 적합/부적합 표기는
1페이지 법정 점검표(○ 적합, × 부적합, / 해당없음)이며, 당신이 쓰는 문장은 그것을 보완하는
해설일 뿐입니다** — 여기서 새로운 판정을 내리거나 1페이지 표기와 다른 결론을 암시하지 마세요.

입력에는 두 가지 서로 다른 카테고리가 이미 분리되어 주어집니다. **절대 섞지 마세요**:
1) "별표3 부적합" — 전기안전관리법 직무고시 별표3에 따른 법정 점검 기준 위반입니다.
2) "회사 자체 권장사항" — 법적 의무가 아닌, 화재예방을 위한 회사 자체 권장 기준(콘센트·스위치
   교체주기 등)입니다. 절대 "부적합"이라고 부르지 말고, 별표3 부적합 개수에도 포함시키지 마세요.
   "법적 의무사항이 아니며"처럼 안 해도 된다는 인상을 주는 표현은 쓰지 마세요 — 대신 "전기안전
   관리법에 OO 기준이 없어 화재예방을 위한 자체 권장 기준으로 안내드립니다"처럼 담백한 사실
   전달로 서술하세요.

**문장 톤 규칙(2026-09-22 서비스·제품팀 품질기준안, 반드시 지킬 것)**:
- 사실만 짧게 씁니다. "위험합니다", "치명적", "곧 화재", "당장 대피", "사망" 같은 공포 조성
  표현을 쓰지 마세요. "감전·화재로 이어질 수 있다"처럼 사고를 나열하며 겁주지 말고, "기준보다
  낮게 측정되었습니다"처럼 상태를 담백하게 서술하세요.
- "OO로 교체하세요", "전선을 잘라 이으세요"처럼 구체적인 공법·자재를 지정하는 시공 지시를
  하지 마세요. "전문 전기공사·관리사무소와 상의해 주세요"처럼 상담·재점검을 안내하는 수준까지만
  쓰세요.
- "과태료가 부과됩니다", "불법입니다"처럼 법적 효과를 단정하지 마세요.
- "저희가 고쳐 드립니다"처럼 당사가 직접 시공을 약속하는 것처럼 읽히는 표현을 쓰지 마세요 —
  "기술 지원·진단 결과 설명은 당사에 문의해 주세요" 정도로만 제공 범위를 밝히세요.
- 한 문장은 40자 안쪽을 권장합니다. 전문 약어는 풀어 쓴 뒤 병기하세요.

작성 규칙:
- 적합 항목(별표3 통과)은 하나하나 설명하지 말고, 전체를 한 문단으로 뭉뚱그려 설명하세요.
  적합 항목이 0개면 이 문단은 빈 문자열로 두세요.
- 별표3 부적합 항목만 각각 개별로 설명하세요. 각 항목마다: (1) 구체적으로 왜 부적합인지(측정값·
  상태 근거를 사실 위주로), (2) 기준 대비 지금 상태가 어떤지, (3) 다음 행동(재점검/전문업체
  상담 등, 위 톤 규칙 준수)을 명확히 제시. 부적합이 0개면 빈 배열로 두세요.
- 회사 자체 권장사항이 있으면 완전히 별도 항목으로 설명하되, 별표3 부적합과 같은 목록에 넣지
  마세요. 없으면 빈 배열로 두세요.
- 입력에 주어지는 "실측값"(절연저항/누설전류/부하전류/접지저항)은 측정된 항목마다 반드시
  하나씩 설명하세요(측정 안 됨으로 표시된 항목은 건너뛰세요). 이 값들은 이미 위 부적합/적합
  판정에도 쓰였지만, 여기서는 "이 숫자 자체가 무엇을 의미하는지"를 입주민이 이해하도록 별도로
  풀어 쓰는 것이 목적입니다.
  - 절연저항·누설전류·접지저항: 입력에 판정기준과 적합/부적합 결과가 함께 주어지면, 실측값과
    기준을 비교해 적합/부적합 여부와 그 의미를 사실 위주로 설명하세요(공포 조성 표현 금지, 위
    톤 규칙 참고). 절연저항·누설전류는 판정기준 계산 불가(회로수 미입력)로 표시될 수 있는데,
    그 경우 그 사실만 담백하게 안내하세요. 접지저항은 220V 저압 세대 고정기준(누전차단기
    감전보호 공식)이라 항상 판정기준이 존재합니다.
  - 부하전류: 판정기준이 존재하지 않습니다. 적합/부적합을 절대 단정하지 마세요. 실측값이
    무엇을 나타내는 수치인지 설명하고, 과부하 여부는 해당 분기회로의 정격용량과 비교해야
    확인 가능하다는 점을 안내하세요. 근거 없이 "정상입니다"라고 단정하지 마세요.
- 과장하지 말고 근거 없는 위험을 지어내지 마세요. 전문 규정 조항 번호는 참고로만 괄호에 넣으세요.
- 입력에 "현장특이사항"이 있으면(워커가 현장에서 직접 적은 자유 메모 — 예: "거실 에어컨
  과부하로 인한 차단기트립 확인") 반드시 검토해서, 관련 있는 별표3 부적합·실측값 항목이 있으면
  그 항목의 explanation에 자연스럽게 녹여 위험요인으로 언급하세요(별개 항목으로 만들지 마세요 —
  기존 판정 항목에 근거를 보태는 용도입니다). 관련되는 기존 항목이 하나도 없으면 종합 총평에서
  짧게 한 번만 언급하세요. 현장특이사항이 비어 있으면 이 규칙은 무시하세요.
- 마지막에 전체 종합 총평 문단을 추가하세요. **별표3 부적합 개수는 violations 배열의 실제
  길이와 정확히 일치해야 합니다** — 세어서 언급하되 임의의 다른 숫자를 쓰지 마세요.
- **권고사항(recommendations, 신설)**: 종합총평과 별개로, "다음에 할 일"만 담은 짧은 목록을
  1~5개(부적합이 없으면 0~1개, 있어도 5개를 넘기지 말고 우선순위 높은 것만) 작성하세요. 각
  항목은 "[대상] + [관찰 사실] + [다음 행동]" 형식의 한 문장(예: "욕실 콘센트 회로 —
  누전차단기 동작이 불안정합니다. 관리사무소에 점검·교체 상담을 요청해 주세요."). 종합총평
  문장을 그대로 복붙하지 마세요. 위 톤 규칙(공포조성·시공지시·과태료단정·당사시공약속 금지)을
  똑같이 지키세요. 회사 자체 권장사항은 여기 다시 넣지 마세요(별도 배열에 이미 있고, 화면에서
  자동으로 합쳐집니다).
- **분량 제한(중요, 반드시 지킬 것)**: 이 결과는 A4 점검표 PDF 2페이지 안에 항상 들어가야
  합니다. 아래 글자수 한도를 절대 넘기지 마세요(공백 포함, 한도를 넘기면 뒷부분이 잘려서
  출력됩니다). 문장을 욕심내지 말고 핵심(상태·기준·다음행동)만 담아 짧게 쓰세요:
  - okSummary: 100자 이내(1~2문장)
  - violations[].explanation: 항목당 130자 이내(2~3문장)
  - companyAdvisory[].explanation: 항목당 100자 이내
  - measurements[].explanation: 항목당 80자 이내(1문장)
  - summary: 120자 이내
  - recommendations[]: 항목당 90자 이내(1문장), 최대 5개

출력은 다음 JSON 형식만 사용하세요(다른 텍스트나 설명 금지):
{
  "okSummary": "적합 항목을 뭉뚱그린 한 문단, 100자 이내 (없으면 \\"\\")",
  "violations": [{"item":"항목명","explanation":"이유+기준대비상태+다음행동을 담되 130자 이내로 압축(공포조성 금지)"}],
  "companyAdvisory": [{"item":"항목명","explanation":"담백한 사실 전달 설명, 100자 이내"}],
  "measurements": [{"item":"절연저항|누설전류|부하전류|접지저항","value":"단위 포함 실측값","explanation":"이 값이 의미하는 바, 80자 이내"}],
  "summary": "종합 총평 (별표3 부적합 개수를 violations 배열 길이와 정확히 일치시켜 언급), 120자 이내",
  "recommendations": ["[대상]+[관찰사실]+[다음행동] 형식 한 문장, 90자 이내, 최대 5개"]
}`;

// 위 프롬프트가 지시한 글자수 한도를 LLM이 지키지 않는 경우를 대비한 안전망 — 프롬프트 한도에
// 여유를 주면(예전 시도: +30~50%) 부적합 4건+회사권장 2건처럼 항목 수가 많이 겹치는 실제 사례
// (34건 중 1건)에서 그 여유분이 누적돼 3페이지로 넘어갔다(2026-09-10, 실측 검증) — "항상
// 2페이지" 보장이 목표이므로 프롬프트가 요구한 한도와 동일한 값을 하드캡으로 그대로 적용한다.
// 실측 34건 전체(부적합 0~5건, 회사권장 0~2건 조합 포함)로 검증 완료.
const FIELD_LENGTH_CAPS = {
  okSummary: 100,
  violationExplanation: 130,
  companyAdvisoryExplanation: 100,
  measurementExplanation: 80,
  summary: 120,
  recommendation: 90
} as const;

function clampText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + "…";
}

/** 절연저항/누설전류/접지저항은 판정기준을 계산해 적합·부적합을 함께 알려주고, 부하전류는
 * 판정기준이 없다는 사실 자체를 명시해 AI가 임의로 적합/부적합을 지어내지 못하게 한다. */
function buildMeasurementLines(params: {
  loadCurrent: number | null;
  igr: number | null;
  insulationResistance: number | null;
  groundingResistance: number | null;
  circuitBreakerCount: number | null;
}): string[] {
  const { loadCurrent, igr, insulationResistance, groundingResistance, circuitBreakerCount } = params;
  const lines: string[] = [];

  if (insulationResistance !== null) {
    const threshold = computeInsulationResistanceThreshold(circuitBreakerCount);
    lines.push(
      threshold === null
        ? `- 절연저항: ${insulationResistance}MΩ (회로수 미입력으로 판정기준 계산 불가)`
        : `- 절연저항: ${insulationResistance}MΩ (판정기준: ${threshold.toFixed(3)}MΩ 미만이면 부적합, 회로수 ${circuitBreakerCount}개 기준 → ${insulationResistance < threshold ? "부적합" : "적합"})`
    );
  } else {
    lines.push("- 절연저항: 측정 안 됨");
  }

  if (igr !== null) {
    const threshold = computeLeakageCurrentThreshold(circuitBreakerCount);
    lines.push(
      threshold === null
        ? `- 누설전류(IGR): ${igr}mA (회로수 미입력으로 판정기준 계산 불가)`
        : `- 누설전류(IGR): ${igr}mA (판정기준: ${threshold}mA 초과면 부적합, 회로수 ${circuitBreakerCount}개 기준 → ${igr > threshold ? "부적합" : "적합"})`
    );
  } else {
    lines.push("- 누설전류(IGR): 측정 안 됨");
  }

  lines.push(
    loadCurrent !== null
      ? `- 부하전류: ${loadCurrent}A (판정기준 없음 — 분기회로 정격용량 정보가 없어 시스템이 적합/부적합을 자동판정하지 않는 참고용 실측값)`
      : "- 부하전류: 측정 안 됨"
  );

  if (groundingResistance !== null) {
    const threshold = computeGroundingResistanceThreshold();
    lines.push(
      `- 접지저항: ${groundingResistance}Ω (판정기준: ${threshold.toFixed(1)}Ω 초과면 부적합, 220V 저압 세대 고감도 누전차단기(30mA) 기준 → ${groundingResistance > threshold ? "부적합" : "적합"})`
    );
  } else {
    lines.push("- 접지저항: 측정 안 됨");
  }

  return lines;
}

function buildUserPrompt(params: {
  dong: string;
  ho: string;
  checklistItems: ChecklistEntry[];
  autoDiagnosis: DiagnosisEntry[];
  companyAdvisories: CompanyAdvisoryEntry[];
  loadCurrent: number | null;
  igr: number | null;
  insulationResistance: number | null;
  groundingResistance: number | null;
  circuitBreakerCount: number | null;
  etcNotes: string;
}): string {
  const { dong, ho, checklistItems, autoDiagnosis, companyAdvisories, etcNotes } = params;
  const okItems = checklistItems.filter((i) => i.result === "O").map((i) => i.item);
  const violationLines = autoDiagnosis.map(
    (d, idx) => `${idx + 1}. ${d.item} — ${d.comment} (${d.regulation})`
  );
  const advisoryLines = companyAdvisories.map((a, idx) => `${idx + 1}. ${a.item} — ${a.comment}`);
  const measurementLines = buildMeasurementLines(params);

  return [
    `[세대 전기설비점검 결과 - ${dong}동 ${ho}호]`,
    "",
    "실측값:",
    measurementLines.join("\n"),
    "",
    `별표3 기준 적합(정상) 항목 ${okItems.length}개:`,
    okItems.length > 0 ? okItems.map((i) => `- ${i}`).join("\n") : "(없음)",
    "",
    `별표3 부적합 항목 ${autoDiagnosis.length}개:`,
    violationLines.length > 0 ? violationLines.join("\n") : "(없음)",
    "",
    `회사 자체 권장사항 ${companyAdvisories.length}개 (별표3과 무관, 절대 부적합 아님):`,
    advisoryLines.length > 0 ? advisoryLines.join("\n") : "(없음)",
    "",
    `현장특이사항(워커가 현장에서 직접 입력한 메모, 참고용):`,
    etcNotes.trim() ? etcNotes.trim() : "(없음)",
    "",
    "이 데이터로 위 시스템 지침대로 JSON을 작성하세요."
  ].join("\n");
}

export async function generateUnitInspectionAiDiagnosis(params: {
  dong: string;
  ho: string;
  checklistItems: ChecklistEntry[];
  autoDiagnosis: DiagnosisEntry[];
  companyAdvisories: CompanyAdvisoryEntry[];
  loadCurrent: number | null;
  igr: number | null;
  insulationResistance: number | null;
  groundingResistance: number | null;
  circuitBreakerCount: number | null;
  etcNotes: string;
}): Promise<UnitInspectionAiDiagnosis> {
  const userPrompt = buildUserPrompt(params);
  // 3200으로 올렸다가도 실측 중 부적합이 많은 건(12항목 중 다수 X)에서 output=3200 그대로
  // 잘려 JSON 파싱 실패가 실제로 발생함(2026-09-09, 소급적용 1건차에서 재현) — 비슷한 구조의
  // field-report-opinion.ts가 6000을 쓰고 있는 걸 참고해 동일하게 맞춤.
  const raw = await callClaudeCustom(SYSTEM_PROMPT, userPrompt, 6000, 110_000);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) {
    throw new Error("AI 안전진단 응답에서 JSON을 추출하지 못했습니다.");
  }
  const parsed = JSON.parse(jsonText) as Partial<UnitInspectionAiDiagnosis>;
  return {
    okSummary: clampText(typeof parsed.okSummary === "string" ? parsed.okSummary : "", FIELD_LENGTH_CAPS.okSummary),
    violations: (Array.isArray(parsed.violations) ? parsed.violations : []).map((v) => ({
      item: v.item,
      explanation: clampText(v.explanation ?? "", FIELD_LENGTH_CAPS.violationExplanation)
    })),
    companyAdvisory: (Array.isArray(parsed.companyAdvisory) ? parsed.companyAdvisory : []).map((a) => ({
      item: a.item,
      explanation: clampText(a.explanation ?? "", FIELD_LENGTH_CAPS.companyAdvisoryExplanation)
    })),
    measurements: (Array.isArray(parsed.measurements) ? parsed.measurements : []).map((m) => ({
      item: m.item,
      value: m.value,
      explanation: clampText(m.explanation ?? "", FIELD_LENGTH_CAPS.measurementExplanation)
    })),
    summary: clampText(typeof parsed.summary === "string" ? parsed.summary : "", FIELD_LENGTH_CAPS.summary),
    // 권고사항(2026-09-22) — 최대 5개(품질기준안 2-2), 각 항목 글자수 캡. LLM이 형식을 안
    // 지켜도 렌더링(document-pdf.tsx)에서 companyAdvisory와 합쳐 다시 한 번 slice(0,5)하므로
    // 이중 안전망.
    recommendations: (Array.isArray(parsed.recommendations) ? parsed.recommendations : [])
      .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      .slice(0, 5)
      .map((r) => clampText(r, FIELD_LENGTH_CAPS.recommendation))
  };
}

/**
 * 제출 API의 `after()` 콜백에서 호출하는 사후보정 오케스트레이터(2026-08-26, 대표님 결정:
 * "사후보정형" — 워커/전기과장은 제출 즉시 응답을 받고, 이 함수가 백그라운드에서 AI 안전진단을
 * 생성해 정정본 PDF로 조용히 교체한다). 실패해도 원본 제출 자체는 이미 끝난 뒤라 사용자에게
 * 영향 없음 — 콘솔 로그만 남기고 삼킨다(호출부에서 다시 catch).
 *
 * 원본 unit_electrical_inspections 행은 pdf_url 발급 즉시 불변이라 절대 UPDATE하지 않고,
 * unit_inspection_ai_diagnoses(113)에 결과를 저장한 뒤 unit_inspection_pdf_corrections(107)
 * 오버레이 패턴으로 "대표 PDF"만 갈아끼운다 — /unit-inspection/[id]·관리자화면이 이미
 * corrections를 우선 조회하도록 되어 있어 이 함수 밖에서 추가로 손댈 곳이 없다.
 */
export async function runUnitInspectionAiDiagnosisAndCorrect(inspectionId: string): Promise<void> {
  const inspection = await pgGetUnitInspection(inspectionId);
  if (!inspection || !inspection.pdfUrl) {
    throw new Error(`AI 안전진단 사후보정: 대상 점검 건을 찾을 수 없거나 아직 PDF가 없습니다 (${inspectionId})`);
  }

  const apartment = await pgFindApartmentByIdentifier(inspection.apartmentId);
  if (!apartment) {
    throw new Error(`AI 안전진단 사후보정: 단지 정보를 찾을 수 없습니다 (${inspection.apartmentId})`);
  }

  const aiDiagnosis = await generateUnitInspectionAiDiagnosis({
    dong: inspection.dong,
    ho: inspection.ho,
    checklistItems: inspection.checklistItems,
    autoDiagnosis: inspection.autoDiagnosis,
    companyAdvisories: inspection.companyAdvisories,
    loadCurrent: inspection.loadCurrent,
    igr: inspection.igr,
    insulationResistance: inspection.insulationResistance,
    groundingResistance: inspection.groundingResistance,
    circuitBreakerCount: inspection.circuitBreakerCount,
    etcNotes: inspection.etcNotes
  });
  await pgSaveUnitInspectionAiDiagnosis(inspectionId, aiDiagnosis);

  const inspectedAtLabel = new Date(inspection.inspectedAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const pdfBytes = await renderUnitInspectionPdf({
    apartmentName: apartment.name,
    electricalSafetyManagerName: apartment.electricalSafetyManagerName,
    dong: inspection.dong,
    ho: inspection.ho,
    inspectedAtLabel,
    inspectionType: inspection.inspectionType,
    checklistItems: inspection.checklistItems,
    loadCurrent: inspection.loadCurrent,
    igr: inspection.igr,
    insulationResistance: inspection.insulationResistance,
    groundingResistance: inspection.groundingResistance,
    etcNotes: inspection.etcNotes,
    circuitBreakerCount: inspection.circuitBreakerCount,
    autoDiagnosis: inspection.autoDiagnosis,
    companyAdvisories: inspection.companyAdvisories,
    residentName: inspection.residentName,
    signatureData: inspection.signatureData,
    aiDiagnosis
  });

  const { dateKey } = getKstDateTime();
  const corrected = await uploadUnitInspectionPdfCopies({
    objectPath: `unit-inspections/corrected/${dateKey}-${sanitizeStoragePathSegment(inspection.dong)}-${sanitizeStoragePathSegment(inspection.ho)}-${inspection.id}.pdf`,
    pdfBytes
  });
  await pgSaveUnitInspectionPdfCorrection(inspectionId, {
    correctedPdfUrl: corrected.pdfUrl,
    correctedPdfPrivatePath: corrected.pdfPrivatePath
  });
}
