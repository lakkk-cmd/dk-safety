import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { pgFindWarrantyByNumber } from "@/lib/warranty-pg";
import { patentServiceTypeLabel } from "@/lib/daekyung-fee-logic";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let logoBase64Cache: string | null = null;
async function loadLogoBase64(): Promise<string> {
  if (logoBase64Cache) return logoBase64Cache;
  const bytes = await readFile(path.join(process.cwd(), "public", "logo.png"));
  logoBase64Cache = bytes.toString("base64");
  return logoBase64Cache;
}

export async function GET(_: Request, context: { params: Promise<{ warrantyNumber: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { warrantyNumber } = await context.params;
  const warranty = await pgFindWarrantyByNumber(warrantyNumber);
  if (!warranty) {
    return NextResponse.json({ message: "보증서를 찾을 수 없습니다." }, { status: 404 });
  }

  const qrTarget = warranty.verifyUrl ?? `http://www.dkansim.com/verify/${encodeURIComponent(warranty.warrantyNumber)}`;
  const qrDataUrl = await QRCode.toDataURL(qrTarget, { margin: 1, width: 240 });
  const logoBase64 = await loadLogoBase64();

  const apartmentText = escapeXml(`${warranty.apartmentName} (${warranty.apartmentCode})`);
  const serviceType = escapeXml(patentServiceTypeLabel(warranty.serviceType));
  const technicianName = escapeXml(warranty.technicianName ?? "-");
  const periodText = escapeXml(`${warranty.warrantyStart ?? "-"} ~ ${warranty.warrantyEnd ?? "-"}`);
  const amountText = escapeXml(`${(warranty.finalAmount ?? 0).toLocaleString("ko-KR")}원`);
  const warrantyNumberText = escapeXml(warranty.warrantyNumber);
  const verifyUrlText = escapeXml(qrTarget);
  const issuedDateText = escapeXml(new Date(warranty.issuedAt).toLocaleDateString("ko-KR"));

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="100%" height="100%" viewBox="0 0 1680 1200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="goldFoil" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FCE3A5" />
      <stop offset="0.45" stop-color="#F0A825" />
      <stop offset="0.6" stop-color="#C6871F" />
      <stop offset="1" stop-color="#F5C15E" />
    </linearGradient>
    <linearGradient id="ribbonFoil" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#B8791A" />
      <stop offset="0.5" stop-color="#F0C25E" />
      <stop offset="1" stop-color="#FCE3A5" />
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="1680" height="1200" fill="#0B1F3A" />
  <rect x="40" y="40" width="1600" height="1120" fill="#FBF6EA" />
  <rect x="52" y="52" width="1576" height="1096" fill="none" stroke="url(#goldFoil)" stroke-width="1.5" />

  <polygon points="0,60 0,182 182,0 60,0" fill="url(#ribbonFoil)" />
  <polygon points="0,182 60,0 96,20 34,182" fill="#8A5C11" fill-opacity="0.35" />
  <polygon points="1680,1140 1680,1018 1498,1200 1620,1200" fill="url(#ribbonFoil)" />
  <polygon points="1680,1018 1620,1200 1584,1180 1646,1018" fill="#8A5C11" fill-opacity="0.35" />

  <image href="data:image/png;base64,${logoBase64}" x="100" y="96" width="130" height="130" preserveAspectRatio="xMidYMid meet" />

  <text x="840" y="140" text-anchor="middle" font-size="44" font-style="italic" fill="#5B6472" font-family="Georgia, 'Times New Roman', serif">Certificate of Warranty</text>
  <text x="840" y="180" text-anchor="middle" font-size="24" letter-spacing="8" fill="#9C8B6E" font-family="Georgia, serif">of ELECTRICAL SAFETY SERVICE</text>

  <text x="840" y="300" text-anchor="middle" font-size="70" font-weight="800" fill="#0B1F3A" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">전기 안전 기술 보증서</text>

  <foreignObject x="240" y="340" width="1200" height="90">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:24px; line-height:1.6; color:#64748B; text-align:center; font-family:Pretendard, 'Apple SD Gothic Neo', sans-serif;">본 증서는 아래 명시된 전기설비 안전점검 및 보수 작업이 대경이엔피(우리집 전기주치의) 소속 전문 기술자에 의해 시공되었으며, 명시된 보증기간 동안 하자보증이 적용됨을 증명합니다.</div>
  </foreignObject>

  <line x1="180" y1="456" x2="1500" y2="456" stroke="#E7D9B8" stroke-width="1" />

  <text x="180" y="534" font-size="25" letter-spacing="1" fill="#C6871F" font-weight="700" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">발급 대상:</text>
  <text x="400" y="534" font-size="32" font-weight="700" fill="#1E293B" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">${apartmentText}</text>
  <line x1="400" y1="546" x2="900" y2="546" stroke="#CBBB94" stroke-width="1.5" />

  <text x="180" y="606" font-size="25" letter-spacing="1" fill="#C6871F" font-weight="700" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">담당 기사:</text>
  <text x="400" y="606" font-size="32" font-weight="700" fill="#1E293B" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">${technicianName}</text>
  <line x1="400" y1="618" x2="700" y2="618" stroke="#CBBB94" stroke-width="1.5" />

  <text x="180" y="678" font-size="25" letter-spacing="1" fill="#C6871F" font-weight="700" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">서비스 유형:</text>
  <text x="400" y="678" font-size="32" font-weight="700" fill="#1E293B" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">${serviceType}</text>
  <line x1="400" y1="690" x2="750" y2="690" stroke="#CBBB94" stroke-width="1.5" />

  <text x="180" y="750" font-size="25" letter-spacing="1" fill="#C6871F" font-weight="700" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">최종 정산 금액:</text>
  <text x="400" y="750" font-size="32" font-weight="700" fill="#1E293B" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">${amountText}</text>
  <line x1="400" y1="762" x2="750" y2="762" stroke="#CBBB94" stroke-width="1.5" />

  <text x="180" y="822" font-size="25" letter-spacing="1" fill="#C6871F" font-weight="700" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">보증 기간:</text>
  <text x="400" y="822" font-size="32" font-weight="700" fill="#1E293B" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">${periodText}</text>
  <line x1="400" y1="834" x2="950" y2="834" stroke="#CBBB94" stroke-width="1.5" />

  <text x="180" y="894" font-size="25" letter-spacing="1" fill="#C6871F" font-weight="700" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">보증 번호:</text>
  <text x="400" y="894" font-size="30" font-weight="700" letter-spacing="1" fill="#1E293B" font-family="'SF Mono', 'Consolas', monospace">${warrantyNumberText}</text>
  <line x1="400" y1="906" x2="950" y2="906" stroke="#CBBB94" stroke-width="1.5" />

  <image href="${qrDataUrl}" x="1154" y="574" width="123" height="123" />

  <text x="1215" y="778" text-anchor="middle" font-size="26" letter-spacing="4" fill="#0B1F3A" font-weight="700" font-family="Georgia, serif">SCAN TO VERIFY</text>
  <text x="1215" y="812" text-anchor="middle" font-size="20" fill="#64748B" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">${verifyUrlText}</text>

  <line x1="700" y1="956" x2="1500" y2="956" stroke="#CBBB94" stroke-width="1" />

  <text x="180" y="1000" font-size="28" font-weight="800" fill="#0B1F3A" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">우리집 전기주치의 (대경이엔피)</text>
  <text x="180" y="1032" font-size="19" fill="#64748B" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">dkansim.com</text>
  <text x="180" y="1058" font-size="19" fill="#64748B" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">@dkansim_official</text>

  <text x="840" y="984" text-anchor="middle" font-size="20" letter-spacing="2" fill="#9C8B6E" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">날짜</text>
  <text x="840" y="1024" text-anchor="middle" font-size="30" font-weight="700" fill="#0B1F3A" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">${issuedDateText}</text>

  <text x="1300" y="984" text-anchor="middle" font-size="20" letter-spacing="2" fill="#9C8B6E" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">대표 서명</text>
  <text x="1300" y="1038" text-anchor="middle" font-size="44" font-style="italic" fill="#0B1F3A" font-family="Georgia, 'Times New Roman', serif">K. Na</text>
  <line x1="1190" y1="1054" x2="1410" y2="1054" stroke="#CBBB94" stroke-width="1" />
  <text x="1300" y="1082" text-anchor="middle" font-size="19" font-weight="700" fill="#334155" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">대표 나경문</text>
</svg>`;
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
