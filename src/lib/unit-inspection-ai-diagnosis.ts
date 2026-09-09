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
};

const SYSTEM_PROMPT = `당신은 전기기사 자격을 보유한 전기안전 전문가입니다.
공동주택 세대 전기설비 점검(전기안전관리법 직무고시 별표3 기준) 결과를 전기를 전혀 모르는
입주민도 이해할 수 있는 말로 풀어서 설명합니다.

입력에는 두 가지 서로 다른 카테고리가 이미 분리되어 주어집니다. **절대 섞지 마세요**:
1) "별표3 부적합" — 전기안전관리법 직무고시 별표3에 따른 법정 점검 기준 위반입니다.
2) "회사 자체 권장사항" — 법적 의무가 아닌, 화재예방을 위한 회사 자체 권장 기준(콘센트·스위치
   교체주기 등)입니다. 절대 "부적합"이라고 부르지 말고, 별표3 부적합 개수에도 포함시키지 마세요.
   "법적 의무사항이 아니며"처럼 안 해도 된다는 인상을 주는 표현은 쓰지 마세요 — 대신 "전기안전
   관리법에 OO 기준이 없어 화재예방을 위한 자체 권장 기준으로 안내드립니다"처럼 담백한 사실
   전달로 서술하세요.

작성 규칙:
- 적합 항목(별표3 통과)은 하나하나 설명하지 말고, 전체를 한 문단으로 뭉뚱그려 설명하세요.
  적합 항목이 0개면 이 문단은 빈 문자열로 두세요.
- 별표3 부적합 항목만 각각 개별로 설명하세요. 각 항목마다: (1) 구체적으로 왜 부적합인지(측정값·
  상태 근거), (2) 지금 방치하면 실제로 어떤 사고(감전/화재/누전)로 이어질 수 있는지, (3) 다음
  행동(정밀점검/즉시교체 등)을 명확히 제시. 부적합이 0개면 빈 배열로 두세요.
- 회사 자체 권장사항이 있으면 완전히 별도 항목으로 설명하되, 별표3 부적합과 같은 목록에 넣지
  마세요. 없으면 빈 배열로 두세요.
- 입력에 주어지는 "실측값"(절연저항/누설전류/부하전류)은 측정된 항목마다 반드시 하나씩
  설명하세요(측정 안 됨으로 표시된 항목은 건너뛰세요). 이 값들은 이미 위 부적합/적합 판정에도
  쓰였지만, 여기서는 "이 숫자 자체가 무엇을 의미하는지"를 입주민이 이해하도록 별도로 풀어
  쓰는 것이 목적입니다.
  - 절연저항·누설전류: 입력에 판정기준과 적합/부적합 결과가 함께 주어지면, 실측값과 기준을
    비교해 적합/부적합 여부와 그 의미(예: 낮을수록 누전 위험, 높을수록 감전 위험)를
    설명하세요. 판정기준 계산 불가(회로수 미입력)로 표시된 경우 그 사실만 담백하게 안내하세요.
  - 부하전류: 판정기준이 존재하지 않습니다. 적합/부적합을 절대 단정하지 마세요. 실측값이
    무엇을 나타내는 수치인지 설명하고, 과부하 여부는 해당 분기회로의 정격용량과 비교해야
    확인 가능하다는 점을 안내하세요. 근거 없이 "정상입니다"라고 단정하지 마세요.
- 과장하지 말고 근거 없는 위험을 지어내지 마세요. 전문 규정 조항 번호는 참고로만 괄호에 넣으세요.
- 마지막에 전체 종합 총평 문단을 추가하세요(별표3 부적합 개수는 정확히 세어서 언급).

출력은 다음 JSON 형식만 사용하세요(다른 텍스트나 설명 금지):
{
  "okSummary": "적합 항목을 뭉뚱그린 한 문단 (없으면 \\"\\")",
  "violations": [{"item":"항목명","explanation":"이유+위험+조치를 담은 3~4문장"}],
  "companyAdvisory": [{"item":"항목명","explanation":"담백한 사실 전달 설명"}],
  "measurements": [{"item":"절연저항|누설전류|부하전류","value":"단위 포함 실측값","explanation":"이 값이 의미하는 바 2~3문장"}],
  "summary": "종합 총평 (별표3 부적합 개수 정확히 언급)"
}`;

/** 절연저항/누설전류는 판정기준을 계산해 적합·부적합을 함께 알려주고, 부하전류는 판정기준이
 * 없다는 사실 자체를 명시해 AI가 임의로 적합/부적합을 지어내지 못하게 한다. */
function buildMeasurementLines(params: {
  loadCurrent: number | null;
  igr: number | null;
  insulationResistance: number | null;
  circuitBreakerCount: number | null;
}): string[] {
  const { loadCurrent, igr, insulationResistance, circuitBreakerCount } = params;
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
  circuitBreakerCount: number | null;
}): string {
  const { dong, ho, checklistItems, autoDiagnosis, companyAdvisories } = params;
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
  circuitBreakerCount: number | null;
}): Promise<UnitInspectionAiDiagnosis> {
  const userPrompt = buildUserPrompt(params);
  // 실측값 진단 필드 추가로 출력이 늘어나 2500→3200으로 여유를 둔다(이 코드베이스에서
  // maxTokens 부족으로 응답이 잘리는 버그가 여러 번 있었던 전례 참고).
  const raw = await callClaudeCustom(SYSTEM_PROMPT, userPrompt, 3200, 110_000);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) {
    throw new Error("AI 안전진단 응답에서 JSON을 추출하지 못했습니다.");
  }
  const parsed = JSON.parse(jsonText) as Partial<UnitInspectionAiDiagnosis>;
  return {
    okSummary: typeof parsed.okSummary === "string" ? parsed.okSummary : "",
    violations: Array.isArray(parsed.violations) ? parsed.violations : [],
    companyAdvisory: Array.isArray(parsed.companyAdvisory) ? parsed.companyAdvisory : [],
    measurements: Array.isArray(parsed.measurements) ? parsed.measurements : [],
    summary: typeof parsed.summary === "string" ? parsed.summary : ""
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
    circuitBreakerCount: inspection.circuitBreakerCount
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
    etcNotes: inspection.etcNotes,
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
