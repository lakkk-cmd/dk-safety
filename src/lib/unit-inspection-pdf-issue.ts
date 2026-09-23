/**
 * 세대점검표 PDF 발급 진입점 — 경로 A만 (2026-09-22 CEO 본작업).
 * page1: 고시 PDF 불변 배경 + 좌표 스탬프
 * page2: AI 안전진단 v2 별첨
 * 구 satori UnitInspectionElement 발급 경로는 사용하지 않는다.
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import {
  renderUnitInspectionPage1PathA,
  type UnitInspectionPathAData
} from "@/lib/unit-inspection-pdf-path-a";
import {
  mergePage1AndPage2,
  renderUnitInspectionPage2Pdf,
  type UnitInspectionAiDiagnosisV2
} from "@/lib/unit-inspection-pdf-page2";
import type { UnitInspectionAiDiagnosis } from "@/lib/unit-inspection-ai-diagnosis";
import type { ChecklistEntry, CompanyAdvisoryEntry, DiagnosisEntry } from "@/lib/unit-inspection-rules";

/** document-pdf UnitInspectionPdfData와 동일 형태 — 순환 import 방지용 로컬 타입 */
export type UnitInspectionIssueInput = {
  apartmentName: string;
  electricalSafetyManagerName: string;
  dong: string;
  ho: string;
  inspectedAtLabel: string;
  inspectionType: "visit" | "unvisited_simple";
  checklistItems: ChecklistEntry[];
  loadCurrent: number | null;
  igr: number | null;
  insulationResistance: number | null;
  etcNotes: string;
  circuitBreakerCount: number | null;
  autoDiagnosis: DiagnosisEntry[];
  companyAdvisories: CompanyAdvisoryEntry[];
  residentName: string | null;
  signatureData: string | null;
  aiDiagnosis?: UnitInspectionAiDiagnosis | null;
};

const MALGUN_CANDIDATES = [
  process.env.UNIT_INSPECTION_STAMP_FONT_PATH || "",
  "C:\\Windows\\Fonts\\malgun.ttf",
  path.join(process.cwd(), "public", "fonts", "NanumGothic-Regular.ttf")
].filter(Boolean);

export function loadUnitInspectionStampFontBytes(): Uint8Array {
  for (const p of MALGUN_CANDIDATES) {
    if (p && existsSync(p)) return new Uint8Array(readFileSync(p));
  }
  // 2026-09-23 회귀: 배포 번들에 public/fonts/NanumGothic-Regular.ttf가 빠진 채로 나가면
  // 로컬(Windows, malgun.ttf 존재)에서는 안 재현되고 프로덕션에서만 실패한다 — 어느 후보
  // 경로를 시도했는지 남겨야 다음에 같은 원인으로 헤매지 않는다.
  throw new Error(
    `경로 A 스탬프 폰트를 찾을 수 없습니다. 시도한 경로: ${MALGUN_CANDIDATES.join(", ") || "(없음)"} ` +
      "— Windows에서는 malgun.ttf, 배포본에서는 public/fonts/NanumGothic-Regular.ttf가 next.config.ts " +
      "outputFileTracingIncludes로 함수 번들에 포함돼야 합니다."
  );
}

function parseInspectedAt(label: string): { year: number; month: number; day: number } {
  const m = label.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function buildEtcNotes(data: UnitInspectionIssueInput): string {
  const parts = [
    data.loadCurrent !== null ? `부하 ${data.loadCurrent}A` : null,
    data.igr !== null ? `IGR ${data.igr}mA` : null,
    data.insulationResistance !== null ? `절연 ${data.insulationResistance}MΩ` : null
  ].filter(Boolean) as string[];
  const base = parts.join(", ");
  if (data.etcNotes?.trim()) return base ? `${base} · ${data.etcNotes.trim()}` : data.etcNotes.trim();
  return base;
}

export function toPathAData(data: UnitInspectionIssueInput): UnitInspectionPathAData {
  return {
    dong: data.dong,
    ho: data.ho,
    residentName: data.residentName,
    inspectedAt: parseInspectedAt(data.inspectedAtLabel),
    checklist: data.checklistItems.map((item) => ({
      id: item.id,
      result: item.result,
      remark: item.note ?? ""
    })),
    etcNotes: buildEtcNotes(data),
    apartmentName: data.apartmentName,
    inspectorName: data.electricalSafetyManagerName || "미지정",
    signatureData: data.inspectionType === "visit" ? data.signatureData : null
  };
}

/** 레거시 AI 진단 → v2 4절+총평문단+권고 (나열 레이아웃 금지) */
export function adaptAiDiagnosisToV2(
  data: UnitInspectionIssueInput,
  ai?: UnitInspectionAiDiagnosis | null
): UnitInspectionAiDiagnosisV2 {
  const failCount = data.checklistItems.filter((i) => i.result === "X").length;
  if (ai) {
    const topFails = (ai.violations ?? []).slice(0, 2).map((v) => v.item).join(", ");
    const observation =
      ai.okSummary?.trim() ||
      (failCount > 0
        ? `이번 점검에서 부적합 ${failCount}건이 확인되었습니다${topFails ? `(${topFails})` : ""}.`
        : "이번 점검에서 별표3 부적합은 확인되지 않았습니다.");
    const interpretation =
      (ai.measurements ?? [])
        .slice(0, 2)
        .map((m) => `${m.item}: ${m.value}`)
        .join("; ") || "실측값은 1페이지 기타사항과 아래 표를 참고해 주세요.";
    // "첫 문장"을 뽑을 때 단순히 "."로 split하면 "0.018MΩ" 같은 실측값의 소수점에서 잘려
    // "절연저항이 0"처럼 의미 없는 문장이 나온다(2026-09-23 실제 발급본에서 재현 확인) —
    // 숫자 뒤에 안 오는 마침표만 문장 끝으로 인정한다.
    const priority =
      (ai.violations?.[0]?.explanation ?? "").split(/[.。](?!\d)/)[0]?.trim() ||
      "관리사무소와 상의해 우선 확인이 필요한 구간부터 보시면 됩니다.";
    const limitation =
      "본 안내는 점검 기록과 실측을 바탕으로 한 상세 설명이며, 공식 적합·부적합 표기는 1페이지 점검기록표를 따릅니다.";
    const recs = [
      ...(ai.recommendations ?? []),
      ...(ai.companyAdvisory ?? []).map((c) => `${c.item}: ${c.explanation}`)
    ]
      .map((r) => r.trim())
      .filter(Boolean)
      .slice(0, 5);
    const summary =
      (ai.summary ?? "").trim() ||
      `${observation} ${interpretation} 관리사무소와 상의해 다음 조치를 검토해 주세요.`;
    return {
      diagnosis: { observation, interpretation, priority, limitation },
      summary,
      recommendations: recs.length
        ? recs
        : failCount > 0
          ? ["관리사무소와 상의해 해당 구간 재확인·보수를 검토해 주세요."]
          : []
    };
  }

  const observation =
    failCount > 0
      ? `규칙엔진 기준으로 부적합 ${failCount}건이 있습니다. AI 상세 진단이 아직 없어 요약만 안내합니다.`
      : "규칙엔진 기준 별표3 부적합은 없습니다. AI 상세 진단이 아직 없어 요약만 안내합니다.";
  return {
    diagnosis: {
      observation,
      interpretation: buildEtcNotes(data) || "실측 입력값을 1페이지에서 확인해 주세요.",
      priority: "상세 AI 진단이 준비되면 정정본으로 안내가 보강됩니다.",
      limitation: "공식 적합·부적합 표기는 1페이지 점검기록표를 따릅니다."
    },
    summary: observation,
    recommendations: (data.companyAdvisories ?? [])
      .slice(0, 3)
      .map((c) => `${c.item}: ${c.comment}`)
  };
}

export async function renderUnitInspectionPdfPathAOnly(data: UnitInspectionIssueInput): Promise<Uint8Array> {
  const fontBytes = loadUnitInspectionStampFontBytes();
  const page1 = await renderUnitInspectionPage1PathA(toPathAData(data), fontBytes);
  const v2 = adaptAiDiagnosisToV2(data, data.aiDiagnosis ?? null);
  const page2 = await renderUnitInspectionPage2Pdf(v2, {
    loadCurrent: data.loadCurrent,
    igr: data.igr,
    insulationResistance: data.insulationResistance,
    circuitBreakerCount: data.circuitBreakerCount
  });
  return mergePage1AndPage2(page1, page2);
}

