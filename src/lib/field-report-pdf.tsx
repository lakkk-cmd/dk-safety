/** 세대 진단 리포트 PDF 생성 — next/og(satori) JSX 렌더 → PNG → pdf-lib로 A4 페이지 합성 */

import { readFileSync, promises as fs } from "fs";
import path from "path";
import React from "react";
import { ImageResponse } from "next/og";
import { PDFDocument, PDFImage } from "pdf-lib";
import {
  SUPABASE_ENABLED,
  SUPABASE_UPLOAD_BUCKET,
  uploadBinaryObject
} from "@/lib/supabase-server";
import type { FieldReport } from "@/lib/field-reports";

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
    fonts: [{ name: "NotoSansKR", data: fontData, style: "normal", weight: 700 }]
  });
  return Buffer.from(await resp.arrayBuffer());
}

/** 텍스트 블록(가변 길이) 높이 추정 — 줄바꿈 보존 + 줌위 계산용 보수적 추정치 */
function estimateTextHeightPx(text: string, charsPerLine = 38, lineHeightPx = 44): number {
  const rawLines = text.split("\n");
  const wrapped = rawLines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return wrapped * lineHeightPx;
}

function TextBlock({ text, fontSize = 26, color = "#1e293b" }: { text: string; fontSize?: number; color?: string }) {
  const lines = text.split("\n");
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {lines.map((line, idx) => (
        <div key={idx} style={{ fontSize, color, lineHeight: 1.5, minHeight: fontSize * 1.2 }}>
          {line || " "}
        </div>
      ))}
    </div>
  );
}

const RISK_COLORS: Record<string, { bg: string; light: string }> = {
  안전: { bg: "#16a34a", light: "#dcfce7" },
  주의: { bg: "#f59e0b", light: "#fef3c7" },
  경고: { bg: "#f97316", light: "#ffedd5" },
  위험: { bg: "#dc2626", light: "#fee2e2" }
};
const DEFAULT_RISK_COLOR = { bg: "#64748b", light: "#f1f5f9" };

const RISK_TONE: Record<string, string> = {
  안전: "점검 결과 이상 없음을 확인하였습니다.",
  주의: "경미한 이상이 감지되어 지속적인 관찰을 권고드립니다.",
  경고: "조속한 조치가 필요한 이상이 발견되었습니다.",
  위험: "즉시 사용 중단 및 교체가 필요한 심각한 이상이 발견되었습니다."
};

const KEC_BY_PART: Record<string, string> = {
  차단기: "KEC 210",
  콘센트: "KEC 232",
  배선: "KEC 210",
  접지단자: "KEC 232",
  기타: "제조사 권장기준"
};

const COST_RANGE_BY_PART: Record<string, string> = {
  차단기: "5만원 ~ 8만원",
  콘센트: "1만원 ~ 2만원 (개당)",
  배선: "현장 시공 범위에 따라 별도 산정",
  접지단자: "3만원 ~ 5만원",
  기타: "현장 확인 후 별도 산정"
};

type Finding = { text: string; kec: string };

function buildFindings(report: FieldReport): Finding[] {
  const findings: Finding[] = [];
  if (report.leakageDetected || (report.breakerTripCurrentMa != null && report.breakerTripCurrentMa > 30)) {
    findings.push({
      text: `누전차단기 동작전류가 정상범위(30mA 이하)를 초과했습니다${report.breakerTripCurrentMa != null ? ` (측정값: ${report.breakerTripCurrentMa}mA)` : ""}.`,
      kec: "KEC 234"
    });
  }
  if (report.insulationResistanceMohm != null && report.insulationResistanceMohm < 1) {
    findings.push({
      text: `절연저항값이 정상범위(1MΩ 이상)에 미달합니다 (측정값: ${report.insulationResistanceMohm}MΩ).`,
      kec: "KEC 212"
    });
  }
  if (report.breakerVisualStatus && report.breakerVisualStatus !== "정상") {
    findings.push({ text: `차단기 육안 상태가 '${report.breakerVisualStatus}'로 확인되었습니다.`, kec: "KEC 210" });
  }
  if (report.groundingStatus && report.groundingStatus !== "정상") {
    findings.push({ text: `접지 연결 상태가 '${report.groundingStatus}'로 확인되었습니다.`, kec: "KEC 232" });
  }
  if (report.outletOverheat) {
    findings.push({ text: `콘센트 과열이 확인되었습니다${report.outletOverheatNote ? ` (${report.outletOverheatNote})` : ""}.`, kec: "KEC 232" });
  }
  if (report.wiringDamage) {
    findings.push({ text: `배선 노출/손상이 확인되었습니다${report.wiringDamageNote ? ` (${report.wiringDamageNote})` : ""}.`, kec: "KEC 210" });
  }
  if (report.breakerYear != null) {
    const age = new Date().getFullYear() - report.breakerYear;
    if (age >= 15) {
      findings.push({ text: `차단기 제조 후 ${age}년이 경과하여 교체 권장 연한에 해당합니다.`, kec: "제조사 권장기준" });
    }
  }
  return findings;
}

function MeasurementRow({
  label,
  value,
  standard,
  verdict
}: {
  label: string;
  value: string;
  standard: string;
  verdict: "정상" | "비정상" | "-";
}) {
  const verdictColor = verdict === "비정상" ? "#dc2626" : verdict === "정상" ? "#16a34a" : "#64748b";
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        background: verdict === "비정상" ? "#fef2f2" : "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 0"
      }}
    >
      <div style={{ display: "flex", width: "30%", fontSize: 22, color: "#334155" }}>{label}</div>
      <div style={{ display: "flex", width: "26%", fontSize: 22, color: "#0f172a", fontWeight: 700 }}>{value}</div>
      <div style={{ display: "flex", width: "26%", fontSize: 20, color: "#64748b" }}>{standard}</div>
      <div style={{ display: "flex", width: "18%", fontSize: 22, color: verdictColor }}>{verdict}</div>
    </div>
  );
}

function HeaderBand({ title, report }: { title: string; report: FieldReport }) {
  const risk = report.riskLevel ? RISK_COLORS[report.riskLevel] ?? DEFAULT_RISK_COLOR : DEFAULT_RISK_COLOR;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", background: NAVY, padding: "44px 64px" }}>
      <div style={{ display: "flex", fontSize: 20, color: GOLD, letterSpacing: 1 }}>우리집 전기주치의(대경이엔피)</div>
      <div style={{ display: "flex", fontSize: 38, color: "#fff", fontWeight: 700, marginTop: 14 }}>{title}</div>
      <div style={{ display: "flex", marginTop: 24, gap: 28 }}>
        <div style={{ display: "flex", fontSize: 18, color: "rgba(255,255,255,0.8)" }}>점검일: {new Date(report.inspectedAt).toLocaleDateString("ko-KR")}</div>
        <div style={{ display: "flex", fontSize: 18, color: "rgba(255,255,255,0.8)" }}>세대주소: {report.apartmentAddress}</div>
      </div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 18, color: "rgba(255,255,255,0.8)" }}>점검기사: 나경문 (전기기사)</div>
      {report.riskLevel ? (
        <div
          style={{
            display: "flex",
            marginTop: 24,
            alignSelf: "flex-start",
            background: risk.bg,
            color: "#fff",
            fontSize: 22,
            fontWeight: 700,
            padding: "10px 28px",
            borderRadius: 999
          }}
        >
          위험등급: {report.riskLevel}
        </div>
      ) : null}
    </div>
  );
}

function buildLandlordCoverElement(report: FieldReport, findings: Finding[]) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: PAGE_W_PX, height: PAGE_H_PX, background: "#fff", fontFamily: "NotoSansKR" }}>
      <HeaderBand title="전기안전 정밀진단 보고서" report={report} />

      <div style={{ display: "flex", flexDirection: "column", padding: "40px 64px", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 24, color: NAVY, fontWeight: 700, marginBottom: 10 }}>1. 점검 개요</div>
          <div style={{ display: "flex", fontSize: 20, color: "#334155", lineHeight: 1.6 }}>
            {report.apartmentAddress} 세대의 분전반·배선·콘센트 상태를 현장 계측한 결과, {RISK_TONE[report.riskLevel ?? ""] ?? "점검을 완료하였습니다."}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 24, color: NAVY, fontWeight: 700, marginBottom: 10 }}>2. 계측 결과 요약</div>
          <div style={{ display: "flex", width: "100%", borderBottom: "2px solid #0f172a", padding: "10px 0", fontSize: 18, color: "#0f172a", fontWeight: 700 }}>
            <div style={{ display: "flex", width: "30%" }}>항목</div>
            <div style={{ display: "flex", width: "26%" }}>측정값</div>
            <div style={{ display: "flex", width: "26%" }}>정상기준</div>
            <div style={{ display: "flex", width: "18%" }}>판정</div>
          </div>
          <MeasurementRow
            label="누전차단기 동작전류"
            value={report.breakerTripCurrentMa != null ? `${report.breakerTripCurrentMa}mA` : "미측정"}
            standard="30mA 이하"
            verdict={report.breakerTripCurrentMa == null ? "-" : report.breakerTripCurrentMa <= 30 ? "정상" : "비정상"}
          />
          <MeasurementRow
            label="절연저항값"
            value={report.insulationResistanceMohm != null ? `${report.insulationResistanceMohm}MΩ` : "미측정"}
            standard="1MΩ 이상"
            verdict={report.insulationResistanceMohm == null ? "-" : report.insulationResistanceMohm >= 1 ? "정상" : "비정상"}
          />
          <MeasurementRow
            label="차단기 육안 상태"
            value={report.breakerVisualStatus ?? "미기록"}
            standard="정상"
            verdict={report.breakerVisualStatus == null ? "-" : report.breakerVisualStatus === "정상" ? "정상" : "비정상"}
          />
          <MeasurementRow
            label="접지 연결 상태"
            value={report.groundingStatus ?? "미기록"}
            standard="정상"
            verdict={report.groundingStatus == null ? "-" : report.groundingStatus === "정상" ? "정상" : "비정상"}
          />
          <MeasurementRow label="콘센트 과열 여부" value={report.outletOverheat ? "YES" : "NO"} standard="NO" verdict={report.outletOverheat ? "비정상" : "정상"} />
          <MeasurementRow label="배선 노출/손상 여부" value={report.wiringDamage ? "YES" : "NO"} standard="NO" verdict={report.wiringDamage ? "비정상" : "정상"} />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 24, color: NAVY, fontWeight: 700, marginBottom: 10 }}>3. 발견된 문제점 및 법적 근거</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {findings.length === 0 ? (
              <div style={{ display: "flex", fontSize: 20, color: "#16a34a" }}>발견된 문제점이 없습니다. 정상 상태입니다.</div>
            ) : (
              findings.map((f, idx) => (
                <div key={idx} style={{ display: "flex", fontSize: 19, color: "#334155" }}>
                  • {f.text}{" "}
                  <span style={{ display: "flex", color: "#1d4ed8", fontWeight: 700, marginLeft: 6 }}>[{f.kec}]</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 24, color: NAVY, fontWeight: 700, marginBottom: 10 }}>4. 교체 필요 부품 및 예상 비용</div>
          {report.urgentParts.length === 0 ? (
            <div style={{ display: "flex", fontSize: 20, color: "#334155" }}>긴급 교체가 필요한 부품이 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {report.urgentParts.map((part) => (
                <div key={part} style={{ display: "flex", fontSize: 20, color: "#334155" }}>
                  • {part}: {COST_RANGE_BY_PART[part] ?? "현장 확인 후 별도 산정"}
                </div>
              ))}
              <div style={{ display: "flex", fontSize: 16, color: "#94a3b8", marginTop: 4 }}>* 실제 비용은 현장 상황에 따라 달라질 수 있습니다.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildOpinionAndSignatureElement(opinionText: string, heightPx: number) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: PAGE_W_PX, height: heightPx, background: "#fff", fontFamily: "NotoSansKR", padding: "56px 64px" }}>
      <div style={{ display: "flex", fontSize: 24, color: NAVY, fontWeight: 700, marginBottom: 18 }}>5. AI 생성 전문 소견</div>
      <TextBlock text={opinionText} fontSize={22} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 60, paddingTop: 30, borderTop: "1px solid #cbd5e1" }}>
        <div style={{ display: "flex", fontSize: 20, color: "#334155" }}>전기기사 나경문 (자격번호: ______________)</div>
        <div style={{ display: "flex", fontSize: 18, color: "#94a3b8", marginTop: 12 }}>서명: ______________________</div>
        <div style={{ display: "flex", fontSize: 16, color: "#94a3b8", marginTop: 12 }}>발급일: {new Date().toLocaleDateString("ko-KR")}</div>
      </div>
    </div>
  );
}

function buildResidentCoverElement(report: FieldReport) {
  const risk = report.riskLevel ? RISK_COLORS[report.riskLevel] ?? DEFAULT_RISK_COLOR : DEFAULT_RISK_COLOR;
  const actions = [
    "두꺼비집(분전반)을 임의로 만지거나 분해하지 마세요.",
    report.outletOverheat || report.wiringDamage ? "이상이 발견된 콘센트·배선의 사용을 즉시 중단하세요." : "이상 부위가 있다면 해당 콘센트 사용을 자제하세요.",
    "가능한 빨리 전문가 점검·수리 일정을 예약하세요."
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", width: PAGE_W_PX, height: PAGE_H_PX, background: "#fff", fontFamily: "NotoSansKR" }}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", background: risk.bg, padding: "56px 64px", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.85)" }}>우리집 전기 안전 가이드</div>
        <div style={{ display: "flex", fontSize: 44, color: "#fff", fontWeight: 700, marginTop: 16 }}>위험등급: {report.riskLevel ?? "확인중"}</div>
        <div style={{ display: "flex", fontSize: 20, color: "#fff", marginTop: 16, textAlign: "center" }}>{RISK_TONE[report.riskLevel ?? ""] ?? "점검을 완료하였습니다."}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", padding: "44px 64px", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 26, color: NAVY, fontWeight: 700, marginBottom: 14 }}>지금 당장 해야 할 것 3가지</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {actions.map((action, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: `3px solid ${risk.bg}`,
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    color: risk.bg,
                    fontWeight: 700
                  }}
                >
                  {idx + 1}
                </div>
                <div style={{ display: "flex", fontSize: 22, color: "#1e293b" }}>{action}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 26, color: NAVY, fontWeight: 700, marginBottom: 14 }}>위험 부위 설명</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {report.leakageDetected || (report.breakerTripCurrentMa != null && report.breakerTripCurrentMa > 30) ? (
              <div style={{ display: "flex", fontSize: 20, color: "#334155" }}>• 분전반(두꺼비집)의 누전차단기가 기준치보다 높은 전류에서 작동해, 감전·화재 위험이 있습니다.</div>
            ) : null}
            {report.insulationResistanceMohm != null && report.insulationResistanceMohm < 1 ? (
              <div style={{ display: "flex", fontSize: 20, color: "#334155" }}>• 전선의 절연 상태가 기준보다 약해, 합선·화재로 이어질 수 있습니다.</div>
            ) : null}
            {report.outletOverheat ? (
              <div style={{ display: "flex", fontSize: 20, color: "#334155" }}>• 콘센트에서 과열이 확인되어, 계속 사용하면 화재 위험이 있습니다.</div>
            ) : null}
            {report.wiringDamage ? <div style={{ display: "flex", fontSize: 20, color: "#334155" }}>• 배선이 노출되거나 손상되어, 감전 위험이 있습니다.</div> : null}
            {!report.leakageDetected && !report.outletOverheat && !report.wiringDamage && !(report.insulationResistanceMohm != null && report.insulationResistanceMohm < 1) ? (
              <div style={{ display: "flex", fontSize: 20, color: "#16a34a" }}>• 특별히 위험한 부위가 발견되지 않았습니다.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildResidentOpinionElement(opinionText: string, heightPx: number) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: PAGE_W_PX, height: heightPx, background: "#fff", fontFamily: "NotoSansKR", padding: "56px 64px" }}>
      <div style={{ display: "flex", fontSize: 24, color: NAVY, fontWeight: 700, marginBottom: 18 }}>전문가 소견</div>
      <TextBlock text={opinionText} fontSize={22} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 60,
          padding: "28px 32px",
          background: "#1a2744",
          borderRadius: 16,
          alignItems: "center"
        }}
      >
        <div style={{ display: "flex", fontSize: 18, color: "rgba(255,255,255,0.7)" }}>긴급 문의</div>
        <div style={{ display: "flex", fontSize: 30, color: "#fff", fontWeight: 700, marginTop: 6 }}>010-8945-1111</div>
      </div>
    </div>
  );
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

async function composeReportPdf(images: Array<{ buffer: Buffer; widthPx: number; heightPx: number }>): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  for (const img of images) {
    const embedded = await pngToImageWithPdfDoc(pdfDoc, img.buffer);
    addSlicedPages(pdfDoc, embedded, img.widthPx, img.heightPx);
  }
  return pdfDoc.save();
}

async function saveReportPdf(buffer: Uint8Array, fileName: string): Promise<string> {
  if (SUPABASE_ENABLED) {
    return uploadBinaryObject({
      bucket: SUPABASE_UPLOAD_BUCKET,
      objectPath: `reports/${fileName}`,
      contentType: "application/pdf",
      data: buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    });
  }
  const dir = path.join(process.cwd(), "public", "uploads", "reports");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), buffer);
  return `/uploads/reports/${fileName}`;
}

export async function generateFieldReportPdfs(report: FieldReport): Promise<{ landlordUrl: string; residentUrl: string }> {
  if (!report.opinionLandlord || !report.opinionResident) {
    throw new Error("AI 소견을 먼저 생성해주세요.");
  }

  const findings = buildFindings(report);

  const landlordCoverPng = await renderElementToPng(buildLandlordCoverElement(report, findings), PAGE_W_PX, PAGE_H_PX);
  const landlordOpinionHeight = Math.max(PAGE_H_PX, estimateTextHeightPx(report.opinionLandlord) + 420);
  const landlordOpinionPng = await renderElementToPng(
    buildOpinionAndSignatureElement(report.opinionLandlord, landlordOpinionHeight),
    PAGE_W_PX,
    landlordOpinionHeight
  );
  const landlordPdfBytes = await composeReportPdf([
    { buffer: landlordCoverPng, widthPx: PAGE_W_PX, heightPx: PAGE_H_PX },
    { buffer: landlordOpinionPng, widthPx: PAGE_W_PX, heightPx: landlordOpinionHeight }
  ]);

  const residentCoverPng = await renderElementToPng(buildResidentCoverElement(report), PAGE_W_PX, PAGE_H_PX);
  const residentOpinionHeight = Math.max(Math.round(PAGE_H_PX * 0.55), estimateTextHeightPx(report.opinionResident) + 320);
  const residentOpinionPng = await renderElementToPng(
    buildResidentOpinionElement(report.opinionResident, residentOpinionHeight),
    PAGE_W_PX,
    residentOpinionHeight
  );
  const residentPdfBytes = await composeReportPdf([
    { buffer: residentCoverPng, widthPx: PAGE_W_PX, heightPx: PAGE_H_PX },
    { buffer: residentOpinionPng, widthPx: PAGE_W_PX, heightPx: residentOpinionHeight }
  ]);

  const landlordUrl = await saveReportPdf(landlordPdfBytes, `report_${report.id}_landlord.pdf`);
  const residentUrl = await saveReportPdf(residentPdfBytes, `report_${report.id}_resident.pdf`);

  return { landlordUrl, residentUrl };
}
