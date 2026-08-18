/** 전기 안전 기술 보증서 가로형 PDF — next/og(satori) JSX 렌더 → PNG 1장 → pdf-lib 랜드스케이프 1페이지.
 * pdf-lib 표준폰트/커스텀폰트 임베딩은 한글을 지원하지 않고(@pdf-lib/fontkit는 이 저장소의
 * Pretendard-Bold.otf(CID-keyed CFF)에서 글리프 메트릭 파싱 버그로 크래시), document-pdf.tsx가
 * 이미 쓰는 satori 경로(NotoSansKR-Bold.woff)를 재사용해 우회한다. */

import { readFile } from "node:fs/promises";
import path from "node:path";
import React from "react";
import { ImageResponse } from "next/og";
import { PDFDocument } from "pdf-lib";
import { patentServiceTypeLabel } from "@/lib/daekyung-fee-logic";
import type { WarrantyView } from "@/lib/warranty-pg";

const W = 1680;
const H = 1200;
const NAVY = "#0B1F3A";
const GOLD = "#C6871F";
const CREAM = "#FBF6EA";
const GRAY = "#64748B";
const MUTED_GOLD = "#9C8B6E";
const HAIRLINE = "#CBBB94";
const SLATE = "#1E293B";

const PAGE_W_PT = 842;
const PAGE_H_PT = 595;

let _fontCache: ArrayBuffer | null = null;
async function loadKoreanFont(): Promise<ArrayBuffer> {
  if (_fontCache) return _fontCache;
  const buf = await readFile(path.join(process.cwd(), "public/fonts/NotoSansKR-Bold.woff"));
  _fontCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return _fontCache;
}

function abs(left: number, top: number, extra: React.CSSProperties = {}): React.CSSProperties {
  return { position: "absolute", left, top, display: "flex", ...extra };
}

function Row({ label, value, y, underlineEnd, mono }: { label: string; value: string; y: number; underlineEnd: number; mono?: boolean }) {
  return (
    <div style={abs(0, 0, { width: W, height: H })}>
      <div style={abs(180, y, { fontSize: 25, letterSpacing: 1, color: GOLD, fontWeight: 700 })}>{label}</div>
      <div style={abs(400, y, { fontSize: mono ? 30 : 32, color: SLATE, fontWeight: 700, ...(mono ? { fontFamily: "monospace" } : {}) })}>{value}</div>
      <div style={abs(400, y + 22, { width: underlineEnd - 400, height: 1.5, background: HAIRLINE })} />
    </div>
  );
}

export async function renderWarrantyPdf(warranty: WarrantyView, verifyUrl: string, qrDataUrl: string): Promise<Buffer> {
  const logoBytes = await readFile(path.join(process.cwd(), "public", "logo.png"));
  const logoDataUrl = `data:image/png;base64,${logoBytes.toString("base64")}`;
  const fontData = await loadKoreanFont();

  const apartmentText = `${warranty.apartmentName} (${warranty.apartmentCode})`;
  const serviceType = patentServiceTypeLabel(warranty.serviceType);
  const technicianName = warranty.technicianName ?? "-";
  const periodText = `${warranty.warrantyStart ?? "-"} ~ ${warranty.warrantyEnd ?? "-"}`;
  const amountText = `${(warranty.finalAmount ?? 0).toLocaleString("ko-KR")}원`;
  const issuedDateText = new Date(warranty.issuedAt).toLocaleDateString("ko-KR");

  const element = (
    <div style={{ width: W, height: H, position: "relative", display: "flex", background: NAVY, fontFamily: "NotoSansKR" }}>
      <div style={abs(40, 40, { width: 1600, height: 1120, background: CREAM })} />
      <div style={abs(52, 52, { width: 1576, height: 1096, border: `1.5px solid ${GOLD}` })} />

      <img src={logoDataUrl} width={130} height={130} style={abs(100, 96, { objectFit: "contain" })} />

      <div style={abs(0, 118, { width: W, height: 60, justifyContent: "center", fontSize: 26, letterSpacing: 4, color: MUTED_GOLD })}>
        Certificate of Warranty
      </div>
      <div style={abs(0, 164, { width: W, height: 30, justifyContent: "center", fontSize: 15, letterSpacing: 8, color: MUTED_GOLD })}>
        of ELECTRICAL SAFETY SERVICE
      </div>

      <div style={abs(0, 232, { width: W, height: 90, justifyContent: "center", fontSize: 68, fontWeight: 700, color: NAVY })}>
        전기 안전 기술 보증서
      </div>

      <div style={abs(240, 340, { width: 1200, flexDirection: "column", alignItems: "center", fontSize: 24, color: GRAY, textAlign: "center" })}>
        <div>본 증서는 아래 명시된 전기설비 안전점검 및 보수 작업이 대경이엔피(우리집 전기주치의)</div>
        <div>소속 전문 기술자에 의해 시공되었으며, 명시된 보증기간 동안 하자보증이 적용됨을 증명합니다.</div>
      </div>

      <div style={abs(180, 456, { width: 1320, height: 1, background: "#E7D9B8" })} />

      <Row label="발급 대상:" value={apartmentText} y={520} underlineEnd={900} />
      <Row label="담당 기사:" value={technicianName} y={592} underlineEnd={700} />
      <Row label="서비스 유형:" value={serviceType} y={664} underlineEnd={750} />
      <Row label="최종 정산 금액:" value={amountText} y={736} underlineEnd={750} />
      <Row label="보증 기간:" value={periodText} y={808} underlineEnd={950} />
      <Row label="보증 번호:" value={warranty.warrantyNumber} y={880} underlineEnd={950} mono />

      <img src={qrDataUrl} width={123} height={123} style={abs(1154, 574, {})} />
      <div style={abs(1092, 700, { width: 246, justifyContent: "center", fontSize: 24, letterSpacing: 4, color: NAVY, fontWeight: 700 })}>
        SCAN TO VERIFY
      </div>
      <div style={abs(1092, 736, { width: 246, justifyContent: "center", fontSize: 17, color: GRAY, textAlign: "center" })}>{verifyUrl}</div>

      <div style={abs(700, 956, { width: 800, height: 1, background: HAIRLINE })} />

      <div style={abs(180, 972, { fontSize: 30, fontWeight: 700, color: NAVY })}>우리집 전기주치의 (대경이엔피)</div>
      <div style={abs(180, 1010, { fontSize: 18, color: GRAY })}>dkansim.com</div>
      <div style={abs(180, 1038, { fontSize: 18, color: GRAY })}>@dkansim_official</div>

      <div style={abs(700, 968, { width: 280, justifyContent: "center", fontSize: 18, letterSpacing: 2, color: MUTED_GOLD })}>날짜</div>
      <div style={abs(700, 1004, { width: 280, justifyContent: "center", fontSize: 28, fontWeight: 700, color: NAVY })}>{issuedDateText}</div>

      <div style={abs(1160, 968, { width: 280, justifyContent: "center", fontSize: 18, letterSpacing: 2, color: MUTED_GOLD })}>대표 서명</div>
      <div style={abs(1160, 1006, { width: 280, justifyContent: "center", fontSize: 34, color: NAVY })}>K. Na</div>
      <div style={abs(1190, 1052, { width: 220, height: 1, background: HAIRLINE })} />
      <div style={abs(1160, 1064, { width: 280, justifyContent: "center", fontSize: 18, fontWeight: 700, color: SLATE })}>대표 나경문</div>
    </div>
  );

  const pngResponse = new ImageResponse(element, {
    width: W,
    height: H,
    fonts: [{ name: "NotoSansKR", data: fontData, style: "normal", weight: 700 }]
  });
  const pngBytes = Buffer.from(await pngResponse.arrayBuffer());

  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngBytes);
  const page = pdf.addPage([PAGE_W_PT, PAGE_H_PT]);
  const scale = Math.min(PAGE_W_PT / W, PAGE_H_PT / H);
  const drawW = W * scale;
  const drawH = H * scale;
  page.drawImage(image, { x: (PAGE_W_PT - drawW) / 2, y: (PAGE_H_PT - drawH) / 2, width: drawW, height: drawH });

  return Buffer.from(await pdf.save());
}
