import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { listPendingSettlements, listSettlementHistory, settleWorkerAssignment } from "@/lib/erp-db";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const [pending, history] = await Promise.all([listPendingSettlements(), listSettlementHistory()]);
    return NextResponse.json({ pending, history });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** 완료된 작업 1건에 대해 기사 수당을 확정 — worker_assignments + expenses(인건비)에
 *  원자적으로 기록된다(settle_worker_assignment RPC). 같은 건 재정산은 worker_assignments의
 *  UNIQUE(reservation_id, worker_id) 제약 위반으로 자동 차단된다. */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = (await req.json()) as {
      reservationId?: string;
      workerId?: string;
      payAmount?: number;
      note?: string;
      expenseDate?: string;
      workerName?: string;
      serviceType?: string;
    };
    const reservationId = body.reservationId?.trim();
    const workerId = body.workerId?.trim();
    const payAmount = Number(body.payAmount);

    if (!reservationId || !workerId) {
      return NextResponse.json({ error: "reservationId, workerId가 필요합니다." }, { status: 400 });
    }
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      return NextResponse.json({ error: "지급액을 올바르게 입력하세요." }, { status: 400 });
    }

    const result = await settleWorkerAssignment({
      reservationId,
      workerId,
      payAmount,
      note: body.note?.trim() || null,
      expenseDate: body.expenseDate ?? new Date().toISOString().slice(0, 10),
      expenseDescription: `${body.workerName ?? "기사"} 수당 - ${body.serviceType ?? "현장 작업"}`,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "정산 처리 실패";
    const alreadySettled = message.includes("duplicate key") || message.includes("worker_assignments_reservation_id_worker_id_key");
    return NextResponse.json(
      { error: alreadySettled ? "이미 정산 처리된 작업입니다." : message },
      { status: alreadySettled ? 409 : 500 },
    );
  }
}
