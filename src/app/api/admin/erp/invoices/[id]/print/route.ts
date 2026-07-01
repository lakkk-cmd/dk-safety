import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getInvoice } from "@/lib/erp-db";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  tax_invoice: "세금계산서",
  receipt: "영수증",
  quote: "견적서",
};

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  const invoice = await getInvoice(id);
  if (!invoice) return new NextResponse("Not found", { status: 404 });

  const typeLabel = TYPE_LABEL[invoice.type] ?? invoice.type;
  const formatKRW = (n: number) => n.toLocaleString("ko-KR") + "원";
  const formatDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("ko-KR") : "-");

  const itemRows = invoice.items
    .map(
      (item) =>
        `<tr>
          <td>${item.description}</td>
          <td style="text-align:right">${item.qty}</td>
          <td style="text-align:right">${formatKRW(item.unit_price)}</td>
          <td style="text-align:right">${formatKRW(item.amount)}</td>
        </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${typeLabel} - ${invoice.invoice_number}</title>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #111; }
  h1 { font-size: 28px; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; color: #555; margin-bottom: 32px; font-size: 14px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .info-box { border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; }
  .info-box h3 { margin: 0 0 8px; font-size: 13px; color: #555; }
  .info-box p { margin: 2px 0; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #1e3a5f; color: #fff; padding: 10px 12px; text-align: left; font-size: 13px; }
  td { padding: 9px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
  tr:last-child td { border-bottom: none; }
  .totals { margin-left: auto; width: 280px; }
  .totals tr td:first-child { color: #555; }
  .totals tr td:last-child { text-align: right; font-weight: 600; }
  .totals .grand-total td { font-size: 18px; color: #1e3a5f; border-top: 2px solid #1e3a5f; padding-top: 12px; }
  .footer { margin-top: 48px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 16px; }
  @media print {
    body { margin: 0; }
    button { display: none !important; }
  }
</style>
</head>
<body>
<button onclick="window.print()" style="position:fixed;top:16px;right:16px;padding:8px 20px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;">🖨️ 인쇄 / PDF 저장</button>
<h1>${typeLabel}</h1>
<p class="subtitle">${invoice.invoice_number} · 발행일: ${formatDate(invoice.issued_at)}</p>

<div class="info-grid">
  <div class="info-box">
    <h3>공급자</h3>
    <p><strong>우리집 전기주치의 (대경이엔피)</strong></p>
    <p>광주광역시 서구</p>
    <p>☎ 010-9469-8578</p>
    <p>www.dkansim.com</p>
  </div>
  <div class="info-box">
    <h3>공급받는자</h3>
    <p><strong>${invoice.customer_name}</strong></p>
    ${invoice.customer_business_number ? `<p>사업자번호: ${invoice.customer_business_number}</p>` : ""}
    ${invoice.customer_phone ? `<p>연락처: ${invoice.customer_phone}</p>` : ""}
    ${invoice.customer_address ? `<p>주소: ${invoice.customer_address}</p>` : ""}
    ${invoice.due_at ? `<p>납부기한: ${formatDate(invoice.due_at)}</p>` : ""}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:50%">품목/내용</th>
      <th style="width:12%">수량</th>
      <th style="width:19%">단가</th>
      <th style="width:19%">금액</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>

<table class="totals">
  <tr><td>공급가액</td><td>${formatKRW(invoice.subtotal)}</td></tr>
  ${invoice.tax > 0 ? `<tr><td>부가세 (10%)</td><td>${formatKRW(invoice.tax)}</td></tr>` : ""}
  <tr class="grand-total"><td>합계</td><td>${formatKRW(invoice.total)}</td></tr>
</table>

<div class="footer">
  우리집 전기주치의 (대경이엔피) · dkansim.com · 이 문서는 전자적으로 생성되었습니다.
</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
