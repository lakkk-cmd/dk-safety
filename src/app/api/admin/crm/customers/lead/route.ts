import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createConsultationLog } from "@/lib/crm-db";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

/** 잠재고객 명함 등록(예약 없이 이름·연락처만) 전용 — 관리자가 직접 확인 후 등록하는
 *  구조화된 소량 데이터라, 상담 기록 작성용 Gemini 스팸 검증(validateConsultation)은
 *  건너뛴다. 메모를 안 적으면 기본 문구가 들어가는데, 이 문구는 일반적이라
 *  validateConsultation의 "충분히 구체적인가" 기준에 자주 걸려 반려되는 문제가 실제로
 *  있었다(엑셀 일괄등록과 동일한 이유로 이 경로도 검증을 건너뛴다). */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = (await req.json()) as { name?: string; phone?: string; memo?: string };
    const name = body.name?.trim();
    const phone = body.phone?.trim();
    if (!name || !phone) {
      return NextResponse.json({ error: "이름과 연락처가 필요합니다." }, { status: 400 });
    }

    const log = await createConsultationLog({
      customer_phone: phone,
      customer_name: name,
      channel: "visit",
      content: body.memo?.trim() || "잠재고객 명함 등록",
      next_contact_at: null,
      status: "pending",
      result: null,
      worker_id: null,
    });
    return NextResponse.json({ log });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
