/** AI 생성 문서(점검보고서/견적서/계약서 등) 범용 PDF 생성 — next/og(satori) JSX 렌더 → 세로로 긴 PNG 1장 → pdf-lib로 A4 슬라이스 */

import { readFileSync } from "fs";
import path from "path";
import React from "react";
import { ImageResponse } from "next/og";
import { PDFDocument, PDFImage } from "pdf-lib";

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
