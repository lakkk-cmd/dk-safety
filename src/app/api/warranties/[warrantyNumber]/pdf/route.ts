import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { pgFindWarrantyByNumber } from "@/lib/warranty-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { renderWarrantyPdf } from "@/lib/warranty-pdf";

export async function GET(_: Request, context: { params: Promise<{ warrantyNumber: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { warrantyNumber } = await context.params;
  const warranty = await pgFindWarrantyByNumber(warrantyNumber);
  if (!warranty) {
    return NextResponse.json({ message: "보증서를 찾을 수 없습니다." }, { status: 404 });
  }

  const verifyUrl = warranty.verifyUrl ?? `http://www.dkansim.com/verify/${encodeURIComponent(warranty.warrantyNumber)}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 240, margin: 1 });
  const bytes = await renderWarrantyPdf(warranty, verifyUrl, qrDataUrl);

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=\"${warranty.warrantyNumber}.pdf\"`,
      "Cache-Control": "no-store"
    }
  });
}
