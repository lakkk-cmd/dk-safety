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
