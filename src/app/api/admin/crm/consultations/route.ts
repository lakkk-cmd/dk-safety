import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import {
  listConsultationLogs,
  createConsultationLog,
  updateConsultationLog,
  createFollowUpReminder,
} from "@/lib/crm-db";
import { validateConsultation, GEMINI_ENABLED } from "@/lib/cross-validate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  const phone = req.nextUrl.searchParams.get("phone") ?? undefined;
  try {
    const logs = await listConsultationLogs(phone);
    return NextResponse.json({ logs });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = await req.json() as {
      action?: string;
      id?: string;
      customer_phone: string;
      customer_name: string;
      channel: string;
      content: string;
      next_contact_at?: string | null;
      status?: string;
      result?: string;
      worker_id?: string | null;
      // follow-up reminder fields
      remind_at?: string;
      message?: string;
    };

    if (body.action === "update" && body.id) {
      await updateConsultationLog(body.id, {
        status: body.status as "pending" | "resolved" | "follow_up",
        result: body.result,
        next_contact_at: body.next_contact_at ?? null,
      });
      return NextResponse.json({ ok: true });
    }

    if (GEMINI_ENABLED) {
      const validation = await validateConsultation({
        customerName: body.customer_name,
        customerPhone: body.customer_phone,
        channel: body.channel ?? "phone",
        content: body.content,
        nextContactAt: body.next_contact_at ?? null,
      });
      if (!validation.passed) {
        return NextResponse.json({ error: `상담 기록 검증 실패: ${validation.reason}` }, { status: 422 });
      }
    }

    const log = await createConsultationLog({
      customer_phone: body.customer_phone,
      customer_name: body.customer_name,
      channel: (body.channel ?? "phone") as "phone" | "kakao" | "visit" | "sms",
      content: body.content,
      next_contact_at: body.next_contact_at ?? null,
      status: (body.status ?? "pending") as "pending" | "resolved" | "follow_up",
      result: body.result ?? null,
      worker_id: body.worker_id ?? null,
    });

    // 재상담 알림 자동 생성
    if (body.next_contact_at && body.status === "follow_up") {
      await createFollowUpReminder({
        consultation_id: log.id,
        customer_name: body.customer_name,
        customer_phone: body.customer_phone,
        remind_at: body.next_contact_at,
        message: `[재상담] ${body.customer_name}님 (${body.customer_phone}) - ${body.content.slice(0, 50)}`,
        status: "pending",
      });
    }

    return NextResponse.json({ log });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
