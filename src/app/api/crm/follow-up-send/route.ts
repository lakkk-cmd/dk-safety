import { NextRequest, NextResponse } from "next/server";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { listFollowUpReminders, updateFollowUpStatus } from "@/lib/crm-db";
import { sendSMS } from "@/lib/solapi-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.AGENT_WRITE_SECRET?.trim();

  // AGENT_WRITE_SECRET or admin manual trigger (id provided)
  const isAgent = secret && auth === `Bearer ${secret}`;
  if (!isAgent) {
    const { isAdminAuthenticated } = await import("@/lib/admin-auth");
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = await req.json() as { id?: string };

    if (body.id) {
      // 단건 수동 발송
      const all = await listFollowUpReminders();
      const rem = all.find((r) => r.id === body.id);
      if (!rem) return NextResponse.json({ error: "알림 없음" }, { status: 404 });

      let sent = false;
      let error: string | undefined;
      try {
        await sendSMS(rem.customer_phone, rem.message);
        await updateFollowUpStatus(rem.id, "sent");
        sent = true;
      } catch (e) {
        error = (e as Error).message;
      }
      return NextResponse.json({ sent, error });
    }

    // 배치: 오늘 마감 pending 전체 발송
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const reminders = await listFollowUpReminders({
      from: todayStart.toISOString(),
      to: todayEnd.toISOString(),
      status: "pending",
    });

    const results: { id: string; phone: string; sent: boolean; error?: string }[] = [];
    for (const rem of reminders) {
      try {
        await sendSMS(rem.customer_phone, rem.message);
        await updateFollowUpStatus(rem.id, "sent");
        results.push({ id: rem.id, phone: rem.customer_phone, sent: true });
      } catch (e) {
        results.push({ id: rem.id, phone: rem.customer_phone, sent: false, error: (e as Error).message });
      }
    }

    return NextResponse.json({ results, total: results.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
