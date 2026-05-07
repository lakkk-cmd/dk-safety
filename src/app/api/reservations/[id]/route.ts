import { NextResponse } from "next/server";
import type { Reservation } from "@/lib/reservations-store";
import { readReservations, updateReservation } from "@/lib/reservations-store";
import { appendActivityLog } from "@/lib/activity-log";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { pgSetReservationPayment } from "@/lib/reservations-pg";
import { pushReservationProgressNotifications } from "@/lib/live-notify";

const allowedStatuses = new Set(["waiting_payment", "접수", "진행중", "완료"]);

/** GET 본문: `tasks`·`orders` 조인 기반 진행 필드(스네이크 케이스) + 기존 Reservation 필드 */
export type ReservationDetailPayload = Reservation & {
  payment_status: string | null;
  dispatch_status: string | null;
  prepayment_confirmed: boolean;
  task_status: string | null;
};

function toReservationDetailPayload(r: Reservation): ReservationDetailPayload {
  return {
    ...r,
    payment_status: r.orderPaymentStatus ?? null,
    dispatch_status: r.orderDispatchStatus ?? null,
    prepayment_confirmed: Boolean(r.orderPrepaymentConfirmed),
    task_status: r.taskStatus ?? null
  };
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const reservations = await readReservations();
  const reservation = reservations.find((item) => item.id === id);
  if (!reservation) {
    return NextResponse.json({ message: "대상을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ reservation: toReservationDetailPayload(reservation) });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as { status?: string; note?: string; isPaid?: boolean; prepaymentTxId?: string; paidAmount?: number };
  const status = body.status?.trim() ?? "";
  const note = typeof body.note === "string" ? body.note.trim() : undefined;
  const isPaid = body.isPaid;
  const updatePayload: { status?: "waiting_payment" | "접수" | "진행중" | "완료"; note?: string; noteUpdatedAt?: string } = {};
  const hasPaymentUpdate = typeof isPaid === "boolean";

  if (status) {
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ message: "유효하지 않은 상태값입니다." }, { status: 400 });
    }
    updatePayload.status = status as "waiting_payment" | "접수" | "진행중" | "완료";
  }

  if (typeof note === "string") {
    if (note.length > 300) {
      return NextResponse.json({ message: "메모는 300자 이하로 입력해주세요." }, { status: 400 });
    }
    updatePayload.note = note;
    updatePayload.noteUpdatedAt = new Date().toISOString();
  }

  if (!updatePayload.status && typeof updatePayload.note !== "string" && !hasPaymentUpdate) {
    return NextResponse.json({ message: "변경할 값이 없습니다." }, { status: 400 });
  }

  if (hasPaymentUpdate) {
    if (!isSupabaseReservationsDbReady()) {
      return NextResponse.json({ message: "입금 상태 변경은 Supabase DB 모드에서만 지원됩니다." }, { status: 400 });
    }
    const paid = Boolean(isPaid);
    const paymentUpdated = await pgSetReservationPayment(id, paid, {
      prepaymentTxId: body.prepaymentTxId,
      paidAmount: body.paidAmount
    });
    if (!paymentUpdated) {
      return NextResponse.json({ message: "대상을 찾을 수 없습니다." }, { status: 404 });
    }
    await appendActivityLog({
      action: "status_updated",
      reservationId: paymentUpdated.id,
      message: `${paymentUpdated.name} 고객 예약이 ${paid ? "예약금 결제 완료" : "미입금"} 상태로 변경되었습니다.`
    });
    await pushReservationProgressNotifications({
      reservationId: paymentUpdated.id,
      customerName: paymentUpdated.name,
      customerPhone: paymentUpdated.phone,
      adminMessage: `${paymentUpdated.name} 예약의 예약금 결제 상태가 ${paid ? "완료" : "미완료"}로 변경되었습니다.`,
      residentMessage: paid
        ? `${paymentUpdated.name}님 결제가 확인되었습니다. 기사 배정을 시작합니다.`
        : `${paymentUpdated.name}님 결제 확인이 취소되어 접수 대기 상태입니다.`
    });
    return NextResponse.json({ message: "입금 상태가 업데이트되었습니다.", reservation: paymentUpdated });
  }

  const updated = await updateReservation(id, updatePayload);
  if (!updated) {
    return NextResponse.json({ message: "대상을 찾을 수 없습니다." }, { status: 404 });
  }

  if (updatePayload.status) {
    await appendActivityLog({
      action: "status_updated",
      reservationId: updated.id,
      message: `${updated.name} 고객 예약 상태가 '${updated.status}'로 변경되었습니다.`
    });
  }

  if (typeof updatePayload.note === "string") {
    await appendActivityLog({
      action: "note_updated",
      reservationId: updated.id,
      message: `${updated.name} 고객 예약 메모가 수정되었습니다.`
    });
  }

  return NextResponse.json({ message: "예약 정보가 업데이트되었습니다.", reservation: updated });
}
