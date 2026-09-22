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

let stampFontCache: Uint8Array | null = null;

/**
 * 스탬프 폰트. 배포본은 저장소의 NanumGothic(○/한글 풀 글리프)이다.
 * 후보 배열을 돌며 existsSync로 고르면 Vercel 파일 트레이싱이 ttf를 빠뜨려
 * 프로덕션 발급이 통째로 실패한다 — Noto 로더와 같이 리터럴 경로를 바로 읽는다.
 * 로컬에서 다른 폰트를 쓰려면 UNIT_INSPECTION_STAMP_FONT_PATH만 쓴다.
 */
export function loadUnitInspectionStampFontBytes(): Uint8Array {
  const override = process.env.UNIT_INSPECTION_STAMP_FONT_PATH;
  if (override && existsSync(override)) {
    return new Uint8Array(readFileSync(override));
  }
  if (stampFontCache) return stampFontCache;
  const fontPath = path.join(process.cwd(), "public/fonts/NanumGothic-Regular.ttf");
  stampFontCache = new Uint8Array(readFileSync(fontPath));
  return stampFontCache;
}

/** 점검일 라벨. Vercel은 UTC라 timeZone 없으면 자정 직후 KST 날짜가 하루 전으로 찍힌다. */
export function formatUnitInspectionDateLabel(value: string | Date): string {
  return new Date(value).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function kstCalendar(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(d);
  const num = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: num("year"), month: num("month"), day: num("day") };
}

function parseInspectedAt(label: string): { year: number; month: number; day: number } {
  const m = label.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return kstCalendar(new Date());
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

function failedChecklistLabels(data: UnitInspectionIssueInput): string[] {
  return data.checklistItems.filter((i) => i.result === "X").map((i) => i.item.trim()).filter(Boolean);
}

/** 1페이지 체크리스트 X 건수가 공식 부적합 수다. 총평 문장의 다른 숫자는 그 수로 맞춘다. */
function alignSummaryFailCount(summary: string, failCount: number): string {
  const trimmed = summary.trim();
  if (!trimmed) {
    return failCount > 0
      ? `이번 점검에서 부적합 ${failCount}건이 확인되었습니다. 관리사무소와 상의해 다음 조치를 검토해 주세요.`
      : "이번 점검에서 별표3 부적합은 확인되지 않았습니다.";
  }
  if (failCount === 0) return trimmed.replace(/부적합\s*\d+\s*건/g, "부적합 없음");
  const replaced = trimmed.replace(/부적합\s*\d+\s*건/g, `부적합 ${failCount}건`);
  if (!replaced.includes(`부적합 ${failCount}건`)) return `부적합 ${failCount}건. ${replaced}`;
  return replaced;
}

/** 레거시 AI 진단 → v2 4절+총평문단+권고 (나열 레이아웃 금지) */
export function adaptAiDiagnosisToV2(
  data: UnitInspectionIssueInput,
  ai?: UnitInspectionAiDiagnosis | null
): UnitInspectionAiDiagnosisV2 {
  const fails = failedChecklistLabels(data);
  const failCount = fails.length;
  if (ai) {
    const namePart = fails.length > 0 ? `(${fails.slice(0, 3).join(", ")}${fails.length > 3 ? " 등" : ""})` : "";
    const failLead =
      failCount > 0
        ? `이번 점검에서 부적합 ${failCount}건${namePart}이 확인되었습니다.`
        : "이번 점검에서 별표3 부적합은 확인되지 않았습니다.";
    const ok = ai.okSummary?.trim();
    const observation = ok ? `${failLead} ${ok}` : failLead;
    const interpretation =
      (ai.measurements ?? [])
        .map((m) => {
          const item = (m.item ?? "").trim();
          const value = (m.value ?? "").trim();
          const expl = (m.explanation ?? "").trim();
          if (expl) return `${item}${value ? `(${value})` : ""}: ${expl}`;
          if (item || value) return [item, value].filter(Boolean).join(": ");
          return "";
        })
        .filter(Boolean)
        .join(" ") || "실측값은 1페이지 기타사항과 아래 표를 참고해 주세요.";
    const priorityBits = (ai.violations ?? [])
      .map((v) => (v.explanation ?? "").split(/[.。]/)[0]?.trim() || (v.item ?? "").trim())
      .filter(Boolean);
    const priority = priorityBits.length
      ? priorityBits.join(" ")
      : "관리사무소와 상의해 우선 확인이 필요한 구간부터 보시면 됩니다.";
    const limitation =
      "본 안내는 점검 기록과 실측을 바탕으로 한 상세 설명이며, 공식 적합·부적합 표기는 1페이지 점검기록표를 따릅니다.";
    const recs = [
      ...(ai.recommendations ?? []),
      ...(ai.companyAdvisory ?? []).map((c) => `${c.item}: ${c.explanation}`)
    ]
      .map((r) => r.trim())
      .filter(Boolean)
      .slice(0, 5);
    return {
      diagnosis: { observation, interpretation, priority, limitation },
      summary: alignSummaryFailCount(ai.summary ?? "", failCount),
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
