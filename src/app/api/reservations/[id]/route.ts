import { NextResponse } from "next/server";
import type { Reservation } from "@/lib/reservations-store";
import { hasReservationTimeConflict, readReservations, updateReservation } from "@/lib/reservations-store";
import { appendActivityLog } from "@/lib/activity-log";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { pgSetReservationPayment } from "@/lib/reservations-pg";
import { pushLiveNotification, pushReservationProgressNotifications } from "@/lib/live-notify";
import { TIME_PATTERN } from "@/lib/reservation-validation";

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
  const body = (await request.json()) as {
    status?: string;
    note?: string;
    isPaid?: boolean;
    prepaymentTxId?: string;
    paidAmount?: number;
    preferredDate?: string;
    preferredTime?: string;
  };
  const status = body.status?.trim() ?? "";
  const note = typeof body.note === "string" ? body.note.trim() : undefined;
  const isPaid = body.isPaid;
  const rawPreferredDate = typeof body.preferredDate === "string" ? body.preferredDate.trim() : undefined;
  const rawPreferredTime = typeof body.preferredTime === "string" ? body.preferredTime.trim() : undefined;
  const updatePayload: {
    status?: "waiting_payment" | "접수" | "진행중" | "완료";
    note?: string;
    noteUpdatedAt?: string;
    preferredDate?: string;
    preferredTime?: string;
  } = {};
  const hasPaymentUpdate = typeof isPaid === "boolean";
  const hasScheduleUpdate = rawPreferredDate !== undefined || rawPreferredTime !== undefined;

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

  let scheduleContext: { previousDate: string; previousTime: string; assignedWorkerId: string | null } | null = null;

  if (hasScheduleUpdate) {
    const reservations = await readReservations();
    const current = reservations.find((item) => item.id === id);
    if (!current) {
      return NextResponse.json({ message: "대상을 찾을 수 없습니다." }, { status: 404 });
    }
    if (current.status === "완료" || current.status === "취소") {
      return NextResponse.json({ message: "완료되었거나 취소된 예약은 일정을 변경할 수 없습니다." }, { status: 400 });
    }

    const nextDate = rawPreferredDate || current.preferredDate;
    const nextTime = rawPreferredTime || current.preferredTime;
    if (!nextDate || Number.isNaN(new Date(nextDate).getTime())) {
      return NextResponse.json({ message: "방문 희망일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (!TIME_PATTERN.test(nextTime)) {
      return NextResponse.json({ message: "방문 요청시간 형식이 올바르지 않습니다. 예: 14:30" }, { status: 400 });
    }

    if (nextDate !== current.preferredDate || nextTime !== current.preferredTime) {
      const hasConflict = await hasReservationTimeConflict(nextDate, nextTime, id);
      if (hasConflict) {
        return NextResponse.json(
          { message: "변경하려는 방문 시간에는 이미 다른 예약이 있습니다. 다른 시간을 선택해주세요." },
          { status: 409 }
        );
      }
      updatePayload.preferredDate = nextDate;
      updatePayload.preferredTime = nextTime;
      scheduleContext = {
        previousDate: current.preferredDate,
        previousTime: current.preferredTime,
        assignedWorkerId: current.assignedWorkerId ?? null
      };
    }
  }

  if (
    !updatePayload.status &&
    typeof updatePayload.note !== "string" &&
    !updatePayload.preferredDate &&
    !hasPaymentUpdate
  ) {
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

  if (scheduleContext) {
    await appendActivityLog({
      action: "schedule_changed",
      reservationId: updated.id,
      message: `${updated.name} 고객 예약 일정이 ${scheduleContext.previousDate} ${scheduleContext.previousTime} → ${updated.preferredDate} ${updated.preferredTime}로 변경되었습니다.`
    });
    await pushReservationProgressNotifications({
      reservationId: updated.id,
      customerName: updated.name,
      customerPhone: updated.phone,
      adminMessage: `${updated.name} 예약 일정이 ${updated.preferredDate} ${updated.preferredTime}로 변경되었습니다.`,
      residentMessage: `${updated.name}님 예약 일정이 ${updated.preferredDate} ${updated.preferredTime}로 변경되었습니다.`
    });
    if (scheduleContext.assignedWorkerId) {
      await pushLiveNotification({
        role: "worker",
        targetWorkerId: scheduleContext.assignedWorkerId,
        reservationId: updated.id,
        title: "배정 일정 변경",
        message: `${updated.name} 고객 작업 일정이 ${updated.preferredDate} ${updated.preferredTime}로 변경되었습니다.`
      });
    }
  }

  return NextResponse.json({ message: "예약 정보가 업데이트되었습니다.", reservation: updated });
}
