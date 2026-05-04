import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export async function pushLiveNotification(input: {
  role: "admin" | "worker" | "resident";
  title: string;
  message: string;
  reservationId?: string;
  targetWorkerId?: string;
  targetPhone?: string;
}) {
  const supabase = requireSupabaseAdmin();
  const payload = {
    role: input.role,
    title: input.title.trim(),
    message: input.message.trim(),
    reservation_id: input.reservationId ?? null,
    target_worker_id: input.targetWorkerId ?? null,
    target_phone: input.targetPhone?.replaceAll(/[^0-9]/g, "") ?? null
  };
  const { error } = await supabase.from("live_notifications").insert(payload);
  if (error) {
    throw new Error(`실시간 알림 저장 실패: ${error.message}`);
  }
}

export async function pushReservationProgressNotifications(params: {
  reservationId: string;
  customerName: string;
  customerPhone?: string;
  adminMessage: string;
  residentMessage: string;
}) {
  await pushLiveNotification({
    role: "admin",
    title: "예약 진행 알림",
    message: params.adminMessage,
    reservationId: params.reservationId
  });
  if (params.customerPhone?.trim()) {
    await pushLiveNotification({
      role: "resident",
      title: "예약 진행 알림",
      message: params.residentMessage,
      reservationId: params.reservationId,
      targetPhone: params.customerPhone
    });
  }
}
