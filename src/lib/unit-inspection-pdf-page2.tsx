/**
 * 세대전기점검표 2페이지 — "AI 안전진단 결과 (상세)" 별첨 렌더러 (경로 A, 2026-09-22 CEO 절대기준).
 *
 * 1페이지(unit-inspection-pdf-path-a.ts)는 원본 별지15 고시 PDF를 바이트 불변 배경으로 쓰고
 * 빈칸만 채우는 완전히 별개의 파이프라인(pdf-lib 오버레이)이다. 이 파일은 그와 **완전히
 * 분리된** 2페이지 별첨만 담당한다 — 진단·총평·권고는 전부 여기 있고, 1페이지 쪽 코드는
 * 이 내용을 전혀 모른다(품질기준안 v2 "1p/2p 완전 분리" 원칙).
 *
 * 진단 출력 규칙(v2, 나열 금지):
 * - 진단 본문은 4절(관찰→의미·인과→우선순위→한계) 모두 있어야 하며, 개별 부적합 항목을
 *   번호 매겨 나열하는 방식(구 violations[] 리스트)은 더 이상 쓰지 않는다.
 * - 종합총평은 불릿 없는 문단 1개(한줄판단→근거→다음).
 * - 실측vs기준표는 진단의 "근거 레이어"일 뿐 진단을 대체하지 않는다 — 그래서 표의 "판정
 *   한 줄"은 AI가 아니라 결정론적으로 계산한다(환각 위험 없음, 매번 같은 입력 같은 결과).
 * - 권고는 총평과 시각적으로 분리된 별도 목록, 1~5개, 회사 자체 권장사항도 여기로 통합
 *   (별도 "자체 권장" 박스 이중화 금지).
 */

import React from "react";
import { PDFDocument } from "pdf-lib";
import {
  PAGE_H_PX,
  PAGE_W_PX,
  addSlicedPages,
  estimateTextHeightPx,
  pngToImageWithPdfDoc,
  renderElementToPng
} from "@/lib/document-pdf";
import {
  computeGroundingResistanceThreshold,
  computeInsulationResistanceThreshold,
  computeLeakageCurrentThreshold
} from "@/lib/unit-inspection-rules";

export type UnitInspectionDiagnosisV2 = {
  /** 관찰 요약(1~2문장) — 나열이 아니라 한 장면으로. */
  observation: string;
  /** 의미·인과(1~2문장) — 실측/기준 관계를 한 줄로 해석. */
  interpretation: string;
  /** 우선순위(1문장) — 여러 부적합 중 지금 먼저 볼 것. */
  priority: string;
  /** 한계·전제(1문장) — 제공 범위·현장 한계, 공식 표기는 1페이지를 따른다는 점. */
  limitation: string;
};

export type UnitInspectionAiDiagnosisV2 = {
  diagnosis: UnitInspectionDiagnosisV2;
  /** 종합총평 — 문단 1개(2~4문장), 불릿 금지. */
  summary: string;
  /** 권고사항 — 회사 자체 권장사항 포함, 1~5개, 총평과 분리. */
  recommendations: string[];
};

export type MeasuredVsStandardInput = {
  loadCurrent: number | null;
  igr: number | null;
  insulationResistance: number | null;
  groundingResistance: number | null;
  circuitBreakerCount: number | null;
};

type MeasuredRow = { label: string; measured: string; standard: string; verdict: string };

/** 실측vs기준 표의 "판정 한 줄"은 AI가 아니라 이미 계산된 값 비교로 결정론적으로 만든다
 * (품질기준안 2-4 "표는 근거, 진단은 문장" — 표 자체엔 해석을 담지 않고 사실만). */
export function buildMeasuredVsStandardRows(input: MeasuredVsStandardInput): MeasuredRow[] {
  const insulationThreshold = computeInsulationResistanceThreshold(input.circuitBreakerCount);
  const leakageThreshold = computeLeakageCurrentThreshold(input.circuitBreakerCount);
  const groundingThreshold = computeGroundingResistanceThreshold();

  const rows: MeasuredRow[] = [
    {
      label: "절연저항",
      measured: input.insulationResistance !== null ? `${input.insulationResistance}MΩ` : "미측정",
      standard: insulationThreshold === null ? "회로수 미입력 — 계산 불가" : `${insulationThreshold.toFixed(3)}MΩ 미만`,
      verdict:
        insulationThreshold === null || input.insulationResistance === null
          ? "판정 보류"
          : input.insulationResistance < insulationThreshold
            ? "기준 미만"
            : "기준 충족"
    },
    {
      label: "누설전류(IGR)",
      measured: input.igr !== null ? `${input.igr}mA` : "미측정",
      standard: leakageThreshold === null ? "회로수 미입력 — 계산 불가" : `${leakageThreshold}mA 초과`,
      verdict:
        leakageThreshold === null || input.igr === null ? "판정 보류" : input.igr > leakageThreshold ? "기준 초과" : "기준 충족"
    },
    {
      label: "부하전류",
      measured: input.loadCurrent !== null ? `${input.loadCurrent}A` : "미측정",
      standard: "기준 없음",
      verdict: "정격용량 대비 확인 필요"
    },
    {
      label: "접지저항",
      measured: input.groundingResistance !== null ? `${input.groundingResistance}Ω` : "미측정",
      standard: `${groundingThreshold.toFixed(1)}Ω 초과`,
      verdict:
        input.groundingResistance === null
          ? "판정 보류"
          : input.groundingResistance > groundingThreshold
            ? "기준 초과"
            : "기준 충족"
    }
  ];
  return rows;
}

const INK = "#201e19";
const MUTED = "#5c574a";
const BORDER = "#3a3628";
const HEADER_TINT = "#e4eaf3";

/** "○"(U+25CB)는 이 repo의 서브셋 NotoSansKR에 글리프가 없어 satori가 렌더링을 실패한다
 * (document-pdf.tsx의 ResultCircle과 동일한 이유·동일한 우회). 2페이지 고정 캡션 문구 안에
 * "○"가 그대로 들어가므로 여기서도 CSS 원으로 대체한다 — 이 페이지는 satori 파이프라인이라
 * 1페이지(경로 A, 실제 문자 글리프 스탬프)와는 다른 제약이 적용된다는 점에 유의. */
function CaptionCircle() {
  return <div style={{ display: "flex", width: 13, height: 13, borderRadius: 13, border: `2.5px solid ${MUTED}` }} />;
}

function Page2Element({
  data,
  measuredRows,
  heightPx
}: {
  data: UnitInspectionAiDiagnosisV2;
  measuredRows: MeasuredRow[];
  heightPx: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: PAGE_W_PX,
        height: heightPx,
        backgroundColor: "#ffffff",
        fontFamily: "NotoSansKR",
        color: INK,
        padding: "84px 60px 60px 60px"
      }}
    >
      <div style={{ display: "flex", fontSize: 32, marginBottom: 16 }}>AI 안전진단 결과 (상세)</div>
      <div style={{ display: "flex", alignItems: "center", fontSize: 18, color: MUTED, lineHeight: 1.5, marginBottom: 28 }}>
        <div style={{ display: "flex", marginRight: 4 }}>아래는 1페이지 법정 점검기록표를 보완하는 상세 진단입니다. 공식</div>
        <CaptionCircle />
        <div style={{ display: "flex", marginLeft: 3 }}>·×·/ 표기는 1페이지를 따릅니다.</div>
      </div>

      {/* 진단 본문 4절(관찰→의미·인과→우선순위→한계) — 나열이 아니라 서술형 문단 */}
      <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${BORDER}`, borderRadius: 4, marginBottom: 20 }}>
        <div style={{ display: "flex", backgroundColor: HEADER_TINT, padding: "12px 16px", fontSize: 20 }}>진단</div>
        <div style={{ display: "flex", flexDirection: "column", padding: "16px 18px", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 16, color: MUTED, marginBottom: 3 }}>관찰</div>
            <div style={{ display: "flex", fontSize: 20, lineHeight: 1.6 }}>{data.diagnosis.observation}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 16, color: MUTED, marginBottom: 3 }}>의미·인과</div>
            <div style={{ display: "flex", fontSize: 20, lineHeight: 1.6 }}>{data.diagnosis.interpretation}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 16, color: MUTED, marginBottom: 3 }}>우선순위</div>
            <div style={{ display: "flex", fontSize: 20, lineHeight: 1.6 }}>{data.diagnosis.priority}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 16, color: MUTED, marginBottom: 3 }}>한계·전제</div>
            <div style={{ display: "flex", fontSize: 18, lineHeight: 1.6, color: MUTED }}>{data.diagnosis.limitation}</div>
          </div>
        </div>
      </div>

      {/* 실측vs기준 — 근거 레이어(진단 대체 불가), 판정 한 줄은 결정론적 계산 */}
      <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${BORDER}`, borderRadius: 4, marginBottom: 20 }}>
        <div style={{ display: "flex", backgroundColor: HEADER_TINT, padding: "10px 16px", fontSize: 18 }}>실측과 기준 비교</div>
        <div style={{ display: "flex", flexDirection: "column", padding: "12px 16px", gap: 6 }}>
          {measuredRows.map((row, idx) => (
            <div key={idx} style={{ display: "flex", fontSize: 17, lineHeight: 1.4 }}>
              <div style={{ display: "flex", width: 120 }}>{row.label}</div>
              <div style={{ display: "flex", width: 130 }}>실측 {row.measured}</div>
              <div style={{ display: "flex", width: 180, color: MUTED }}>기준 {row.standard}</div>
              <div style={{ display: "flex", flex: 1, color: MUTED }}>{row.verdict}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 종합총평 — 문단 1개, 불릿 금지 */}
      <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#eef3fb", border: "1px solid #c3d3ec", borderRadius: 4, padding: "14px 18px", marginBottom: 20 }}>
        <div style={{ display: "flex", fontSize: 17, color: "#23508f", marginBottom: 6 }}>종합총평</div>
        <div style={{ display: "flex", fontSize: 20, lineHeight: 1.7, color: "#1c2c48" }}>{data.summary}</div>
      </div>

      {/* 권고사항 — 총평과 분리, 회사 자체 권장사항 통합 완료, 최대 5개 */}
      {data.recommendations.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#eef7ee", border: "1px solid #bfe0c0", borderRadius: 4, padding: "14px 18px" }}>
          <div style={{ display: "flex", fontSize: 17, color: "#1f6b2b", marginBottom: 8 }}>권고사항</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.recommendations.slice(0, 5).map((rec, idx) => (
              <div key={idx} style={{ display: "flex", fontSize: 19, color: "#1c2c48", lineHeight: 1.5 }}>
                {idx + 1}. {rec}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function estimateHeight(data: UnitInspectionAiDiagnosisV2, measuredRows: MeasuredRow[]): number {
  const HEADER_INTRO = 84 + 32 + 16 + 28; // padding-top + 제목 + 캡션
  const diagBoxHeader = 12 + 20 + 16;
  const diagBoxInner =
    [data.diagnosis.observation, data.diagnosis.interpretation, data.diagnosis.priority, data.diagnosis.limitation].reduce(
      (sum, t) => sum + 19 + estimateTextHeightPx(t, 58, 32) + 14,
      0
    ) + 32;
  const measuredBoxHeight = 40 + 24 + measuredRows.length * 26 + 20;
  const summaryBoxHeight = 42 + 28 + estimateTextHeightPx(data.summary, 56, 34) + 20;
  const recBoxHeight =
    data.recommendations.length > 0
      ? 44 + 28 + data.recommendations.slice(0, 5).reduce((sum, r) => sum + estimateTextHeightPx(r, 56, 28) + 6, 0)
      : 0;
  return HEADER_INTRO + diagBoxHeader + diagBoxInner + measuredBoxHeight + summaryBoxHeight + recBoxHeight + 40;
}

async function buildPage2Png(
  data: UnitInspectionAiDiagnosisV2,
  measuredRows: MeasuredRow[]
): Promise<{ png: Buffer; heightPx: number }> {
  const heightPx = Math.max(PAGE_H_PX, estimateHeight(data, measuredRows));
  const png = await renderElementToPng(<Page2Element data={data} measuredRows={measuredRows} heightPx={heightPx} />, PAGE_W_PX, heightPx);
  return { png, heightPx };
}

export async function renderUnitInspectionPage2Pdf(
  data: UnitInspectionAiDiagnosisV2,
  measuredInput: MeasuredVsStandardInput
): Promise<Uint8Array> {
  const measuredRows = buildMeasuredVsStandardRows(measuredInput);
  const { png, heightPx } = await buildPage2Png(data, measuredRows);
  const pdfDoc = await PDFDocument.create();
  const image = await pngToImageWithPdfDoc(pdfDoc, png);
  addSlicedPages(pdfDoc, image, PAGE_W_PX, heightPx);
  return pdfDoc.save();
}

export async function renderUnitInspectionPage2PreviewPng(
  data: UnitInspectionAiDiagnosisV2,
  measuredInput: MeasuredVsStandardInput
): Promise<Buffer> {
  const measuredRows = buildMeasuredVsStandardRows(measuredInput);
  const { png } = await buildPage2Png(data, measuredRows);
  return png;
}

/** 1페이지(경로 A pdf-lib 오버레이) + 2페이지(이 파일의 satori 렌더)를 한 PDF로 합친다.
 * 두 파이프라인이 완전히 분리돼 있으므로 여기서만 합친다 — 서로의 내부를 모른다. */
export async function mergePage1AndPage2(page1Bytes: Uint8Array, page2Bytes: Uint8Array): Promise<Uint8Array> {
  const finalDoc = await PDFDocument.create();
  const page1Doc = await PDFDocument.load(page1Bytes);
  const page2Doc = await PDFDocument.load(page2Bytes);
  const [p1] = await finalDoc.copyPages(page1Doc, [0]);
  finalDoc.addPage(p1);
  const page2Indices = page2Doc.getPageIndices();
  const p2Pages = await finalDoc.copyPages(page2Doc, page2Indices);
  for (const p of p2Pages) finalDoc.addPage(p);
  return finalDoc.save();
}
