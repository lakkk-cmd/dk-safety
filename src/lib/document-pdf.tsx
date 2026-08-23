/** AI 생성 문서(점검보고서/견적서/계약서 등) 범용 PDF 생성 — next/og(satori) JSX 렌더 → 세로로 긴 PNG 1장 → pdf-lib로 A4 슬라이스 */

import { readFileSync } from "fs";
import path from "path";
import React from "react";
import { ImageResponse } from "next/og";
import { PDFDocument, PDFImage } from "pdf-lib";
import type { ChecklistEntry, CompanyAdvisoryEntry, DiagnosisEntry } from "@/lib/unit-inspection-rules";

const PAGE_W_PX = 1240;
const PAGE_H_PX = 1754;
const PAGE_W_PT = 595;
const PAGE_H_PT = 842;
const NAVY = "#1a2744";
const GOLD = "#C9A227";

let _fontCache: ArrayBuffer | null = null;
function loadKoreanFont(): ArrayBuffer {
  if (_fontCache) return _fontCache;
  const fontPath = path.join(process.cwd(), "public/fonts/NotoSansKR-Bold.woff");
  const buf = readFileSync(fontPath);
  _fontCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return _fontCache;
}

async function renderElementToPng(element: React.ReactElement, width: number, height: number): Promise<Buffer> {
  const fontData = loadKoreanFont();
  const resp = new ImageResponse(element, {
    width,
    height,
    fonts: [{ name: "NotoSansKR", data: fontData, style: "normal", weight: 700 }],
  });
  return Buffer.from(await resp.arrayBuffer());
}

function estimateTextHeightPx(text: string, charsPerLine = 44, lineHeightPx = 40): number {
  const rawLines = text.split("\n");
  const wrapped = rawLines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return wrapped * lineHeightPx;
}

async function pngToImageWithPdfDoc(pdfDoc: PDFDocument, buffer: Buffer): Promise<PDFImage> {
  return pdfDoc.embedPng(buffer);
}

function addSlicedPages(pdfDoc: PDFDocument, image: PDFImage, naturalWidthPx: number, naturalHeightPx: number) {
  const scale = PAGE_W_PT / naturalWidthPx;
  const totalHeightPt = naturalHeightPx * scale;
  const numPages = Math.max(1, Math.ceil(totalHeightPt / PAGE_H_PT));
  for (let i = 0; i < numPages; i++) {
    const page = pdfDoc.addPage([PAGE_W_PT, PAGE_H_PT]);
    const y = (i + 1) * PAGE_H_PT - totalHeightPt;
    page.drawImage(image, { x: 0, y, width: PAGE_W_PT, height: totalHeightPt });
  }
}

export type DocumentSection = { heading: string; body: string };

function DocumentElement({
  title,
  customerName,
  dateLabel,
  sections,
  heightPx,
}: {
  title: string;
  customerName?: string;
  dateLabel: string;
  sections: DocumentSection[];
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
        padding: "0 64px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", paddingTop: 56, paddingBottom: 24, borderBottom: `4px solid ${NAVY}` }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: NAVY }}>{title}</div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 20, color: "#64748b" }}>
          우리집 전기주치의(대경이엔피) · 사업자번호 208-20-57629 · {dateLabel}
        </div>
        {customerName ? (
          <div style={{ display: "flex", marginTop: 6, fontSize: 22, color: "#1e293b" }}>고객명: {customerName}</div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", paddingTop: 32, gap: 28 }}>
        {sections.map((section, idx) => (
          <div key={idx} style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 700,
                color: NAVY,
                borderLeft: `6px solid ${GOLD}`,
                paddingLeft: 14,
                marginBottom: 12,
              }}
            >
              {section.heading}
            </div>
            <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
              {section.body.split("\n").map((line, lineIdx) => (
                <div key={lineIdx} style={{ display: "flex", fontSize: 22, color: "#334155", lineHeight: 1.6 }}>
                  {line || " "}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", marginTop: "auto", paddingBottom: 40, fontSize: 16, color: "#94a3b8" }}>
        우리집 전기주치의(대경이엔피) | dkansim.com
      </div>
    </div>
  );
}

/** 문서 섹션들을 A4 다중 페이지 PDF로 렌더링한다 (한 장의 긴 이미지를 슬라이스하는 방식). */
export async function renderDocumentPdf(params: {
  title: string;
  customerName?: string | null;
  sections: DocumentSection[];
}): Promise<Uint8Array> {
  const dateLabel = new Date().toLocaleDateString("ko-KR");
  const sectionsHeight = params.sections.reduce(
    (sum, s) => sum + 26 + 12 + estimateTextHeightPx(s.body) + 28,
    0
  );
  const heightPx = Math.max(PAGE_H_PX, 260 + sectionsHeight + 120);

  const png = await renderElementToPng(
    <DocumentElement
      title={params.title}
      customerName={params.customerName ?? undefined}
      dateLabel={dateLabel}
      sections={params.sections}
      heightPx={heightPx}
    />,
    PAGE_W_PX,
    heightPx
  );

  const pdfDoc = await PDFDocument.create();
  const image = await pngToImageWithPdfDoc(pdfDoc, png);
  addSlicedPages(pdfDoc, image, PAGE_W_PX, heightPx);
  return pdfDoc.save();
}

// ── 행정업무운영편람 간이기안문(별지 제2호서식) 양식 — 내부 보고서 전용 ──────────
// "보고서·계획서·검토서 등 내부적으로 결재하는 문서"에 쓰는 공식 양식(2025 행정업무운영
// 편람 73쪽). 좌측 상단 문서등록 표시 + 우측 상단 결재란 + 제목/요약 + 작성기관 + 본문
// 구조를 그대로 따르되, 1인 사업 실제 구조(대표님=결재권자, Gemini=검토자)에 맞춰 채운다.

export type AdminReportMeta = {
  registrationNo: string; // 생산등록번호
  dateLabel: string; // 등록일·결재일에 공통으로 씀 (보고서는 등록/결재가 보통 같은 날)
  draftedBy: string; // 기안자 — 담당 AI 에이전트
  reviewedBy: string; // 검토자 — Gemini 교차검증 등
  approvedBy: string; // 결재권자 — 대표님
  disclosure?: string; // 공개구분 (기본값: 비공개)
  orgLabel?: string; // 작성기관
  summary?: string; // 보고근거 및 보고내용 요약 (선택)
};

function AdminReportElement({
  title,
  meta,
  sections,
  heightPx,
}: {
  title: string;
  meta: AdminReportMeta;
  sections: DocumentSection[];
  heightPx: number;
}) {
  const box: React.CSSProperties = { display: "flex", flexDirection: "column", border: "1.5px solid #1e293b" };
  const row: React.CSSProperties = { display: "flex", borderBottom: "1px solid #cbd5e1" };
  const labelCell: React.CSSProperties = { display: "flex", width: 130, padding: "10px 12px", fontSize: 16, color: "#475569", backgroundColor: "#f1f5f9", borderRight: "1px solid #cbd5e1" };
  const valueCell: React.CSSProperties = { display: "flex", flex: 1, padding: "10px 12px", fontSize: 16, color: "#1e293b" };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: PAGE_W_PX,
        height: heightPx,
        backgroundColor: "#ffffff",
        fontFamily: "NotoSansKR",
        padding: "56px 64px 40px",
      }}
    >
      {/* 상단 문서등록/결재란 그리드 */}
      <div style={{ display: "flex", width: "100%" }}>
        <div style={{ ...box, flex: 1, marginRight: 12 }}>
          <div style={row}><div style={labelCell}>생산등록번호</div><div style={valueCell}>{meta.registrationNo}</div></div>
          <div style={row}><div style={labelCell}>등록일</div><div style={valueCell}>{meta.dateLabel}</div></div>
          <div style={row}><div style={labelCell}>결재일</div><div style={valueCell}>{meta.dateLabel}</div></div>
          <div style={{ display: "flex" }}><div style={labelCell}>공개구분</div><div style={valueCell}>{meta.disclosure ?? "비공개"}</div></div>
        </div>
        <div style={{ ...box, flex: 1 }}>
          <div style={row}><div style={labelCell}>기안자</div><div style={valueCell}>{meta.draftedBy}</div></div>
          <div style={row}><div style={labelCell}>검토자</div><div style={valueCell}>{meta.reviewedBy}</div></div>
          <div style={row}><div style={labelCell}>협조자</div><div style={valueCell}>-</div></div>
          <div style={{ display: "flex" }}><div style={labelCell}>결재권자</div><div style={valueCell}>{meta.approvedBy}</div></div>
        </div>
      </div>

      {/* 제목 */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 36, paddingBottom: 20, borderBottom: `3px solid ${NAVY}` }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: NAVY }}>{title}</div>
        {meta.summary ? (
          <div style={{ display: "flex", marginTop: 10, fontSize: 18, color: "#64748b" }}>{meta.summary}</div>
        ) : null}
      </div>

      {/* 작성기관 */}
      <div style={{ display: "flex", marginTop: 20, fontSize: 18, color: "#334155" }}>
        {meta.orgLabel ?? "우리집 전기주치의(대경이엔피) · AI 경영진 사령부"}
      </div>

      {/* 본문 */}
      <div style={{ display: "flex", flexDirection: "column", paddingTop: 28, gap: 26 }}>
        {sections.map((section, idx) => (
          <div key={idx} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: NAVY, borderLeft: `6px solid ${GOLD}`, paddingLeft: 14, marginBottom: 10 }}>
              {section.heading}
            </div>
            <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
              {section.body.split("\n").map((line, lineIdx) => (
                <div key={lineIdx} style={{ display: "flex", fontSize: 20, color: "#334155", lineHeight: 1.6 }}>
                  {line || " "}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", marginTop: "auto", paddingTop: 32, fontSize: 15, color: "#94a3b8" }}>
        2025 행정업무운영편람 간이기안문(별지 제2호서식) 양식 준용 · 우리집 전기주치의(대경이엔피)
      </div>
    </div>
  );
}

/** 행정업무운영편람 간이기안문 양식으로 내부 보고서 PDF를 렌더링한다. */
export async function renderAdminReportPdf(params: {
  title: string;
  meta: AdminReportMeta;
  sections: DocumentSection[];
}): Promise<Uint8Array> {
  const sectionsHeight = params.sections.reduce((sum, s) => sum + 24 + 10 + estimateTextHeightPx(s.body) + 26, 0);
  const heightPx = Math.max(PAGE_H_PX, 420 + sectionsHeight + 120);

  const png = await renderElementToPng(
    <AdminReportElement title={params.title} meta={params.meta} sections={params.sections} heightPx={heightPx} />,
    PAGE_W_PX,
    heightPx,
  );

  const pdfDoc = await PDFDocument.create();
  const image = await pngToImageWithPdfDoc(pdfDoc, png);
  addSlicedPages(pdfDoc, image, PAGE_W_PX, heightPx);
  return pdfDoc.save();
}

// ── 공동주택 세대내 전기설비 점검기록표(직무고시 별지 15호 커스텀) ──────────────
// 브랜드 문서 톤이 아니라 원본 관공서 서식을 그대로 재현해야 하는 문서라 NAVY/GOLD 브랜드 색
// 대신 원본 서식의 흑백 + 파란 표머리 톤을 쓴다. A4 한 장에 맞도록 설계(pdf-lib 스텝은
// addSlicedPages가 그대로 재사용 — 내용이 넘치면 자동으로 2페이지가 된다).

export type UnitInspectionPdfData = {
  apartmentName: string;
  electricalSafetyManagerName: string;
  dong: string;
  ho: string;
  inspectedAtLabel: string; // "2026년 8월 23일" 형태로 이미 포맷된 문자열
  inspectionType: "visit" | "unvisited_simple";
  checklistItems: ChecklistEntry[];
  loadCurrent: number | null;
  igr: number | null;
  insulationResistance: number | null;
  etcNotes: string;
  autoDiagnosis: DiagnosisEntry[];
  /** 법적 근거 아님(회사 자체 기준) — autoDiagnosis와 반드시 구분해서 렌더링한다 */
  companyAdvisories: CompanyAdvisoryEntry[];
  residentName: string | null;
  /** SignaturePad가 만든 base64 PNG data URL — 세대방문점검만 존재 */
  signatureData: string | null;
};

function groupChecklistByCategory(items: ChecklistEntry[]): { category: string; riskFactors: string[]; items: ChecklistEntry[] }[] {
  const groups: { category: string; riskFactors: string[]; items: ChecklistEntry[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.category === item.category) {
      last.items.push(item);
    } else {
      groups.push({ category: item.category, riskFactors: item.riskFactors, items: [item] });
    }
  }
  return groups;
}

/**
 * AI 안전진단·회사 자체 권장사항 블록은 항목 개수·문구 길이에 따라 높이가 달라진다 — 이
 * 두 블록을 담는 컨테이너를 PAGE_H_PX 고정 높이로 렌더링하면(과거 방식), 부적합 항목이 많은
 * 실제 점검건에서 콘텐츠가 고정 캔버스 높이를 넘어서고, satori의 flex 기본 shrink 동작으로
 * 줄들이 서로 짓눌려 겹쳐 보이는 버그가 발생한다(2026-08-23 실제 발급 PDF에서 발견). renderDocumentPdf/
 * renderAdminReportPdf와 동일하게 콘텐츠 길이 기반 동적 높이를 계산해 이 문제를 근본적으로 막는다.
 */
function estimateAutoDiagnosisBlockHeight(entries: DiagnosisEntry[]): number {
  if (entries.length === 0) return 0;
  const HEADER = 46;
  const BOX_PADDING = 32;
  const entriesHeight = entries.reduce((sum, e) => {
    const itemLine = 26;
    const regulationHeight = estimateTextHeightPx(e.regulation, 58, 24);
    const commentHeight = estimateTextHeightPx(e.comment, 58, 24);
    return sum + itemLine + regulationHeight + commentHeight + 8;
  }, 0);
  const gaps = (entries.length - 1) * 14;
  return HEADER + BOX_PADDING + entriesHeight + gaps;
}

function estimateCompanyAdvisoryBlockHeight(entries: CompanyAdvisoryEntry[]): number {
  if (entries.length === 0) return 0;
  const HEADER = 70;
  const BOX_PADDING = 28;
  const entriesHeight = entries.reduce((sum, e) => {
    const itemLine = 21;
    const commentHeight = estimateTextHeightPx(e.comment, 60, 22);
    return sum + itemLine + commentHeight + 2;
  }, 0);
  const gaps = (entries.length - 1) * 10;
  return HEADER + BOX_PADDING + entriesHeight + gaps;
}

/**
 * 헤더~표~기타사항까지(= AI 안전진단/회사 자체 권장사항 블록 시작 직전)의 대략적인 높이.
 * satori에는 실제 렌더링 후 위치를 알려주는 측정 API가 없어서, 이 값은 CSS 스타일(폰트
 * 크기·padding·margin)을 손으로 합산해 튜닝한 추정치다 — 표는 항상 12항목 고정이라
 * 변동폭이 작지만, 기타사항 텍스트만 길이에 따라 estimateTextHeightPx로 보정한다.
 */
function estimateHeightBeforeDiagnosisBlock(data: UnitInspectionPdfData, etcNotesExtra: number): number {
  const HEADER_INTRO = 371; // [별지 서식]~제목~동호/성명~안내문~"-아래-"
  const TABLE = 798; // 표 헤더 + 12항목 행(minHeight 62 기준)
  const ETC_BOX_BASE = 82; // 기타사항 박스(실측값 한 줄만 있을 때)
  return HEADER_INTRO + TABLE + ETC_BOX_BASE + etcNotesExtra;
}

function UnitInspectionElement({
  data,
  heightPx,
  pageBreakSpacerPx,
}: {
  data: UnitInspectionPdfData;
  heightPx: number;
  pageBreakSpacerPx: number;
}) {
  const groups = groupChecklistByCategory(data.checklistItems);
  const inkColor = "#201e19";
  const mutedColor = "#5c574a";
  const borderColor = "#3a3628";
  const headerTint = "#e4eaf3";
  const blue = "#23508f";
  const redSoft = "#f5e3df";
  const red = "#a93a2c";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: PAGE_W_PX,
        height: heightPx,
        backgroundColor: "#ffffff",
        fontFamily: "NotoSansKR",
        color: inkColor,
        padding: "70px 84px",
      }}
    >
      <div style={{ display: "flex", fontSize: 15, color: mutedColor }}>[별지 제15호 서식]</div>
      <div style={{ display: "flex", justifyContent: "center", fontSize: 34, marginTop: 20, marginBottom: 32 }}>
        공동주택 세대내 전기설비 점검기록표
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginBottom: 20 }}>
        <div style={{ display: "flex", fontSize: 21, borderBottom: `1px solid ${inkColor}`, paddingBottom: 6, width: 260 }}>
          {data.dong}동 {data.ho}호
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
          <div style={{ display: "flex", fontSize: 19, borderBottom: `1px solid ${inkColor}`, paddingBottom: 6, minWidth: 220 }}>
            {data.residentName ?? "입주자 미확인"} 귀하
          </div>
          <div style={{ display: "flex", fontSize: 17, color: mutedColor }}>{data.inspectedAtLabel}</div>
        </div>
      </div>

      {data.inspectionType === "unvisited_simple" ? (
        <div
          style={{
            display: "flex",
            backgroundColor: redSoft,
            color: red,
            border: `1px solid ${red}`,
            borderRadius: 8,
            padding: "14px 18px",
            fontSize: 18,
            marginBottom: 18,
          }}
        >
          ☑ 세대방문미요청 — EPS실 외부점검으로 대체 실시
        </div>
      ) : (
        <div style={{ display: "flex", fontSize: 18, marginBottom: 18 }}>귀하의 전기설비 안전점검 결과를 아래와 같이 알려드립니다.</div>
      )}

      <div style={{ display: "flex", justifyContent: "center", fontSize: 20, marginBottom: 20 }}>- 아&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;래 -</div>

      {/* 표 헤더 */}
      <div style={{ display: "flex", border: `1px solid ${borderColor}`, borderBottom: "none" }}>
        <div style={{ display: "flex", width: 150, backgroundColor: headerTint, padding: "16px 8px", fontSize: 17, justifyContent: "center", borderRight: `1px solid ${borderColor}` }}>
          부적합 설비
        </div>
        <div style={{ display: "flex", flex: 1, backgroundColor: headerTint, padding: "16px 8px", fontSize: 17, justifyContent: "center", borderRight: `1px solid ${borderColor}` }}>
          확인 사항
        </div>
        <div style={{ display: "flex", width: 100, backgroundColor: headerTint, padding: "16px 8px", fontSize: 17, justifyContent: "center", borderRight: `1px solid ${borderColor}` }}>
          점검 결과
        </div>
        <div style={{ display: "flex", width: 160, backgroundColor: headerTint, padding: "16px 8px", fontSize: 17, justifyContent: "center" }}>
          비고
        </div>
      </div>

      {groups.map((group, gIdx) => (
        <div key={gIdx} style={{ display: "flex", border: `1px solid ${borderColor}`, borderBottom: "none" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 150,
              padding: "14px 8px",
              fontSize: 16,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: "rgba(35,80,143,0.05)",
              borderRight: `1px solid ${borderColor}`,
            }}
          >
            <div style={{ display: "flex" }}>{group.category}</div>
            <div style={{ display: "flex", fontSize: 14, color: mutedColor, marginTop: 6 }}>{group.riskFactors.join("·")}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {group.items.map((item, iIdx) => (
              <div
                key={iIdx}
                style={{
                  display: "flex",
                  borderTop: iIdx === 0 ? "none" : `1px solid ${borderColor}`,
                  minHeight: 62,
                }}
              >
                <div style={{ display: "flex", flex: 1, padding: "18px 8px", fontSize: 16, alignItems: "center", borderRight: `1px solid ${borderColor}` }}>
                  {item.item}
                </div>
                <div
                  style={{
                    display: "flex",
                    width: 100,
                    padding: "18px 8px",
                    fontSize: item.result === "N/A" ? 14 : 18,
                    color: item.result === "X" ? red : inkColor,
                    justifyContent: "center",
                    alignItems: "center",
                    borderRight: `1px solid ${borderColor}`,
                  }}
                >
                  {item.result === "N/A" ? "해당없음" : item.result}
                </div>
                <div style={{ display: "flex", width: 160, padding: "18px 8px", fontSize: item.note.length > 8 ? 13 : 15, color: mutedColor, alignItems: "center" }}>
                  {item.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 기타사항 */}
      <div style={{ display: "flex", border: `1px solid ${borderColor}`, marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            width: 150,
            backgroundColor: redSoft,
            padding: "16px 8px",
            fontSize: 16,
            justifyContent: "center",
            alignItems: "center",
            borderRight: `1px solid ${borderColor}`,
          }}
        >
          기 타 사 항
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "18px 16px" }}>
          <div style={{ display: "flex", fontSize: 17, gap: 28 }}>
            <div style={{ display: "flex" }}>부하전류: {data.loadCurrent ?? "-"} A</div>
            <div style={{ display: "flex" }}>IGR·누설전류: {data.igr ?? "-"} mA</div>
            <div style={{ display: "flex" }}>절연저항: {data.insulationResistance ?? "-"} MΩ</div>
          </div>
          {data.etcNotes ? <div style={{ display: "flex", fontSize: 15, color: mutedColor, marginTop: 10 }}>{data.etcNotes}</div> : null}
        </div>
      </div>

      {/* AI 안전진단/회사 자체 권장사항 블록이 표 중간에서 페이지가 잘리면 보기 안 좋으므로,
          내용이 있으면 스페이서로 통째로 다음 페이지로 넘긴다(2026-08-24, 대표님 요청). */}
      {pageBreakSpacerPx > 0 ? <div style={{ display: "flex", height: pageBreakSpacerPx }} /> : null}

      {/* AI 안전진단 */}
      {data.autoDiagnosis.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${borderColor}`, marginBottom: 22 }}>
          <div style={{ display: "flex", backgroundColor: headerTint, padding: "12px 14px", fontSize: 17 }}>AI 안전진단 결과</div>
          <div style={{ display: "flex", flexDirection: "column", padding: "16px 18px", gap: 14 }}>
            {data.autoDiagnosis.map((entry, idx) => (
              <div key={idx} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 16 }}>
                  {entry.item} —{" "}
                  <span style={{ display: "flex", color: red, marginLeft: 6 }}>{entry.verdict}</span>
                </div>
                <div style={{ display: "flex", fontSize: 14, color: mutedColor, marginTop: 4 }}>{entry.regulation}</div>
                <div style={{ display: "flex", fontSize: 14, color: mutedColor, marginTop: 4 }}>{entry.comment}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 회사 자체 기준 안내 — 별표3 AI 안전진단과 시각적으로 명확히 구분(점선 테두리 + 다른 색) */}
      {data.companyAdvisories.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", border: "1.5px dashed #b7791f", borderRadius: 6, marginBottom: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#fdf6e3", padding: "10px 14px" }}>
            <div style={{ display: "flex", fontSize: 16, color: "#8a5a12" }}>우리집 전기주치의 자체 권장사항</div>
            <div style={{ display: "flex", fontSize: 12, color: "#a17a3c", marginTop: 2 }}>※ 직무고시·별표3 등 법적 근거가 아닌 자체 점검 기준입니다</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "14px 16px", gap: 10 }}>
            {data.companyAdvisories.map((entry, idx) => (
              <div key={idx} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 15, color: "#8a5a12" }}>{entry.item}</div>
                <div style={{ display: "flex", fontSize: 13, color: mutedColor, marginTop: 2 }}>{entry.comment}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", fontSize: 14, color: mutedColor, marginBottom: 8 }}>
        ※ 부적합 전기설비는 감전, 화재 등의 위험과 전력손실로 인한 전기 요금의 추가부담 등의 원인이 되오니 조속한 시일내에 수리하시기 바랍니다.
      </div>
      <div style={{ display: "flex", fontSize: 14, color: mutedColor, marginBottom: 32 }}>
        [비고] 점검결과는 O(적합), X(부적합), /(해당없음) 으로 표기 · 세대미방문 시 미점검 항목은 해당없음으로 표기
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${borderColor}`, paddingTop: 24 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 14, color: mutedColor }}>세대 확인</div>
          {data.inspectionType === "unvisited_simple" ? (
            <div style={{ display: "flex", fontSize: 18, marginTop: 6 }}>— 세대 부재로 서명 불가 (미방문 간이점검) —</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
              <div style={{ display: "flex", fontSize: 18 }}>{data.residentName ?? ""}</div>
              {data.signatureData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.signatureData} width={160} height={80} style={{ display: "flex", marginTop: 8 }} alt="세대 서명" />
              ) : (
                <div style={{ display: "flex", fontSize: 14, color: mutedColor, marginTop: 8 }}>(서명 없음)</div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 14, color: mutedColor }}>담당(전기선임자)</div>
          <div style={{ display: "flex", fontSize: 18, marginTop: 8 }}>{data.electricalSafetyManagerName || "미지정"} (인)</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18, fontSize: 17 }}>
        점검단지: {data.apartmentName}
      </div>
    </div>
  );
}

/**
 * 세대전기점검표를 직무고시 별지 15호 서식 그대로 렌더링한다. PAGE_H_PX는 부적합/권장사항이
 * 없는 기본 서식(표+기타사항+서명란)만 담을 때 딱 맞도록 튜닝된 값이라, 그 값을 그대로 베이스로
 * 쓰고 AI 안전진단·회사 자체 권장사항 블록이 실제로 차지할 높이만 더한다. 이 블록이 있으면
 * 표 중간에서 페이지가 잘려 보기 안 좋으므로(2026-08-24), 남는 페이지1 여백만큼 스페이서를
 * 넣어 블록 전체를 페이지 2로 통째로 넘긴다 — addSlicedPages는 그 늘어난 높이를 그대로
 * 여러 페이지로 슬라이스한다.
 */
export async function renderUnitInspectionPdf(data: UnitInspectionPdfData): Promise<Uint8Array> {
  const etcNotesExtra = data.etcNotes ? estimateTextHeightPx(data.etcNotes, 70, 24) : 0;
  const hasDiagnosisContent = data.autoDiagnosis.length > 0 || data.companyAdvisories.length > 0;
  const pageBreakSpacerPx = hasDiagnosisContent
    ? Math.max(0, PAGE_H_PX - estimateHeightBeforeDiagnosisBlock(data, etcNotesExtra))
    : 0;
  const extraHeight =
    estimateAutoDiagnosisBlockHeight(data.autoDiagnosis) +
    estimateCompanyAdvisoryBlockHeight(data.companyAdvisories) +
    etcNotesExtra +
    pageBreakSpacerPx;
  const heightPx = PAGE_H_PX + extraHeight;

  const png = await renderElementToPng(
    <UnitInspectionElement data={data} heightPx={heightPx} pageBreakSpacerPx={pageBreakSpacerPx} />,
    PAGE_W_PX,
    heightPx
  );
  const pdfDoc = await PDFDocument.create();
  const image = await pngToImageWithPdfDoc(pdfDoc, png);
  addSlicedPages(pdfDoc, image, PAGE_W_PX, heightPx);
  return pdfDoc.save();
}

/** 마크다운 유사 텍스트(## 헤더)를 섹션 배열로 파싱한다. */
export function parseMarkdownSections(markdown: string): DocumentSection[] {
  const lines = markdown.split("\n");
  const sections: DocumentSection[] = [];
  let current: DocumentSection | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { heading: headingMatch[1].trim(), body: "" };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    } else {
      current = { heading: "개요", body: line };
    }
  }
  if (current) sections.push(current);
  return sections.filter((s) => s.body.trim().length > 0 || s.heading);
}
