import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { pgFindWarrantyByNumber } from "@/lib/warranty-pg";
import { patentServiceTypeLabel } from "@/lib/daekyung-fee-logic";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

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
  const qrDataUrl = await QRCode.toDataURL(qrTarget, { margin: 1, width: 220 });
  const amountText = `${(warranty.finalAmount ?? 0).toLocaleString("ko-KR")}원`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="1680" viewBox="0 0 1200 1680" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="1200" height="1680" fill="#0b1e4a"/>
  <rect x="60" y="50" width="1080" height="1580" rx="30" fill="#ffffff"/>
  <rect x="60" y="50" width="1080" height="210" rx="30" fill="#103d8c"/>
  <text x="110" y="130" font-size="36" fill="#f8fafc" font-family="Arial" font-weight="700">전기 안전 기술 보증서</text>
  <text x="110" y="182" font-size="22" fill="#cbd5e1" font-family="Arial">DIGITAL WARRANTY CERTIFICATE</text>
  <text x="110" y="260" font-size="34" fill="#0f172a" font-family="Arial" font-weight="700">${warranty.warrantyNumber}</text>
  <text x="110" y="320" font-size="26" fill="#334155" font-family="Arial">단지: ${warranty.apartmentName} (${warranty.apartmentCode})</text>
  <text x="110" y="365" font-size="26" fill="#334155" font-family="Arial">서비스: ${patentServiceTypeLabel(warranty.serviceType)}</text>
  <text x="110" y="410" font-size="26" fill="#334155" font-family="Arial">담당 기사: ${warranty.technicianName ?? "-"}</text>
  <text x="110" y="455" font-size="26" fill="#334155" font-family="Arial">보증 기간: ${warranty.warrantyStart ?? "-"} ~ ${warranty.warrantyEnd ?? "-"}</text>
  <text x="110" y="500" font-size="26" fill="#334155" font-family="Arial">최종 정산 금액: ${amountText}</text>
  <rect x="90" y="550" width="1020" height="430" rx="20" fill="#f8fafc" stroke="#cbd5e1"/>
  <text x="120" y="610" font-size="26" fill="#0f172a" font-family="Arial" font-weight="700">서비스 내용</text>
  <foreignObject x="120" y="635" width="960" height="320">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:22px; line-height:1.5; color:#334155; font-family:Arial;">
      ${warranty.serviceSummary ?? "-"}
    </div>
  </foreignObject>
  <image href="${qrDataUrl}" x="860" y="1020" width="220" height="220"/>
  <text x="110" y="1085" font-size="24" fill="#334155" font-family="Arial">진위 확인 주소</text>
  <text x="110" y="1125" font-size="18" fill="#2563eb" font-family="Arial">${qrTarget}</text>
  <text x="110" y="1200" font-size="20" fill="#475569" font-family="Arial">발급일시: ${new Date(warranty.issuedAt).toLocaleString("ko-KR")}</text>
</svg>`;
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
