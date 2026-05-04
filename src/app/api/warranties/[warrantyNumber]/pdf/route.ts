import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { pgFindWarrantyByNumber } from "@/lib/warranty-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const buffer = Buffer.from(base64, "base64");
  return new Uint8Array(buffer);
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

  const verifyUrl = warranty.verifyUrl ?? `http://www.dkansim.com/verify/${encodeURIComponent(warranty.warrantyNumber)}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 220, margin: 1 });
  const qrBytes = dataUrlToBytes(qrDataUrl);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qrImage = await pdf.embedPng(qrBytes);

  page.drawRectangle({ x: 30, y: 760, width: 535, height: 60, color: rgb(0.06, 0.24, 0.55) });
  page.drawText("Digital Warranty Certificate", { x: 48, y: 785, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(warranty.warrantyNumber, { x: 48, y: 742, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Apartment: ${warranty.apartmentName} (${warranty.apartmentCode})`, { x: 48, y: 710, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`Service: ${warranty.serviceType ?? "-"}`, { x: 48, y: 690, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`Technician: ${warranty.technicianName ?? "-"}`, { x: 48, y: 670, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`Warranty: ${warranty.warrantyStart ?? "-"} ~ ${warranty.warrantyEnd ?? "-"}`, { x: 48, y: 650, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`Final Amount: ${(warranty.finalAmount ?? 0).toLocaleString("ko-KR")} KRW`, { x: 48, y: 630, size: 12, font: bold, color: rgb(0.05, 0.2, 0.45) });

  const summary = (warranty.serviceSummary ?? "-").slice(0, 450);
  const lines = summary.match(/.{1,64}/g) ?? ["-"];
  page.drawText("Service Summary", { x: 48, y: 600, size: 12, font: bold, color: rgb(0.1, 0.1, 0.1) });
  lines.slice(0, 8).forEach((line, index) => {
    page.drawText(line, { x: 48, y: 582 - index * 16, size: 11, font, color: rgb(0.25, 0.25, 0.25) });
  });

  page.drawImage(qrImage, { x: 390, y: 470, width: 170, height: 170 });
  page.drawText("Verify URL", { x: 390, y: 452, size: 11, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(verifyUrl.slice(0, 48), { x: 390, y: 436, size: 9, font, color: rgb(0.1, 0.35, 0.8) });
  if (verifyUrl.length > 48) {
    page.drawText(verifyUrl.slice(48), { x: 390, y: 424, size: 9, font, color: rgb(0.1, 0.35, 0.8) });
  }

  page.drawText(`Issued At: ${new Date(warranty.issuedAt).toLocaleString("ko-KR")}`, {
    x: 48,
    y: 120,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.35)
  });

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=\"${warranty.warrantyNumber}.pdf\"`,
      "Cache-Control": "no-store"
    }
  });
}
