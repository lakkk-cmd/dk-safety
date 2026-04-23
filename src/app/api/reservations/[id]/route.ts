import { NextResponse } from "next/server";
import { updateReservation } from "@/lib/reservations-store";
import { appendActivityLog } from "@/lib/activity-log";

const allowedStatuses = new Set(["접수", "진행중", "완료"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as { status?: string; note?: string };
  const status = body.status?.trim() ?? "";
  const note = typeof body.note === "string" ? body.note.trim() : undefined;
  const updatePayload: { status?: "접수" | "진행중" | "완료"; note?: string; noteUpdatedAt?: string } = {};

  if (status) {
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ message: "유효하지 않은 상태값입니다." }, { status: 400 });
    }
    updatePayload.status = status as "접수" | "진행중" | "완료";
  }

  if (typeof note === "string") {
    if (note.length > 300) {
      return NextResponse.json({ message: "메모는 300자 이하로 입력해주세요." }, { status: 400 });
    }
    updatePayload.note = note;
    updatePayload.noteUpdatedAt = new Date().toISOString();
  }

  if (!updatePayload.status && typeof updatePayload.note !== "string") {
    return NextResponse.json({ message: "변경할 값이 없습니다." }, { status: 400 });
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
