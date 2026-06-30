import { NextResponse } from "next/server";
import { getPayments, getDailyRevenue, getMonthlyRevenue, type TossPayment } from "@/lib/toss-agent";

function checkReadAuth(request: Request): string | null {
  const secret = process.env.AGENT_READ_SECRET?.trim();
  if (!secret) return "AGENT_READ_SECRET가 설정되지 않았습니다.";
  if (request.headers.get("Authorization") !== `Bearer ${secret}`) return "인증 실패";
  return null;
}

function maskName(name: string | undefined): string {
  if (!name || name.length <= 1) return name ?? "";
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}

function maskPhone(phone: string | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/[^0-9]/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-****-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-****-${d.slice(6)}`;
  return phone.replace(/\d{3,4}(?=\d{4}$)/, "****");
}

function maskPayment(p: TossPayment): Record<string, unknown> {
  const m = { ...(p as Record<string, unknown>) };
  if (typeof m.customerName === "string") m.customerName = maskName(m.customerName);
  if (typeof m.customerMobilePhone === "string") m.customerMobilePhone = maskPhone(m.customerMobilePhone);
  if (typeof m.customerEmail === "string") m.customerEmail = "***@***";
  return m;
}

export async function GET(request: Request) {
  const authError = checkReadAuth(request);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError.includes("설정되지") ? 500 : 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") ?? "monthly") as "daily" | "monthly" | "range";
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  try {
    let payments: TossPayment[];
    if (type === "daily") {
      payments = (await getDailyRevenue()).payments;
    } else if (type === "range" && from && to) {
      payments = await getPayments(from, to);
    } else {
      payments = (await getMonthlyRevenue()).payments;
    }

    const total = payments.reduce((sum, p) => sum + (p.totalAmount ?? 0), 0);
    const count = payments.length;
    return NextResponse.json({
      total,
      count,
      average: count > 0 ? Math.round(total / count) : 0,
      list: payments.map(maskPayment),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "매출 조회 실패" },
      { status: 500 },
    );
  }
}
