import type { Reservation } from "@/lib/reservations-store";
import { createReservation } from "@/lib/reservations-store";
import { pgSetReservationPayment } from "@/lib/reservations-pg";
import { appendActivityLog } from "@/lib/activity-log";
import { pushReservationProgressNotifications } from "@/lib/live-notify";
import { sendAdminAlertSms } from "@/lib/solapi-agent";

export const AS_SERVICE_TYPE = "A/S 재방문";

/**
 * A/S(애프터서비스) 재방문 예약을 생성한다. 원 예약(기처리건)의 고객·주소 정보를 그대로
 * 복사하고, 출장비는 항상 0원(무료 자동적용)으로 생성한 뒤 즉시 "결제 확인됨" 상태로
 * 전환해 status를 waiting_payment → 접수로 넘긴다 — 이후 기사배정부터는 일반 예약과
 * 동일한 프로세스를 그대로 탄다. 고객 셀프서비스(보증서 A/S 신청)와 관리자 접수(과거
 * 완료건 선택) 양쪽에서 공유해 규칙이 어긋나지 않도록 한다.
 */
export async function createAsRequestReservation(params: {
  original: Reservation;
  detail: string;
  preferredDate: string;
  preferredTime: string;
  source: "phone" | "online";
  /** 활동 로그·관리자 SMS에 남길 문구 접두(예: 원 보증서 번호, 관리자 접수 안내) */
  logContext: string;
}): Promise<Reservation> {
  const { original, detail, preferredDate, preferredTime, source, logContext } = params;

  const created = await createReservation({
    name: original.name,
    apartmentId: original.apartmentId ?? undefined,
    apartmentName: original.apartmentName ?? undefined,
    apartmentCode: original.apartmentCode ?? undefined,
    phone: original.phone,
    address: original.address,
    serviceType: AS_SERVICE_TYPE,
    preferredDate,
    preferredTime,
    detail,
    imageUrls: [],
    priority: "normal",
    feeWaived: true,
    asSourceReservationId: original.id,
    source
  });

  // 출장비가 0원이라 실제로 받을 결제가 없다 — activate_assignment()는 paid_amount(0) <
  // base_fee(0)가 false라 그대로 통과하므로, "이미 확인된 결제"로 바로 전환해 status를
  // waiting_payment → 접수로 넘긴다.
  const confirmed = await pgSetReservationPayment(created.id, true, {
    prepaymentTxId: "AS_FEE_WAIVED",
    paidAmount: 0
  });

  await appendActivityLog({
    action: "reservation_created",
    reservationId: created.id,
    message: `${created.name} 고객 A/S 요청이 접수되었습니다(출장비 무료 자동적용). ${logContext}`
  });
  await pushReservationProgressNotifications({
    reservationId: created.id,
    customerName: created.name,
    customerPhone: created.phone,
    adminMessage: `[A/S 요청] ${created.name}님 · ${created.apartmentName ?? created.address} · 출장비 무료로 자동 접수되었습니다. ${logContext}`,
    residentMessage: `${created.name}님 A/S 요청이 접수되었습니다(출장비 무료). 확인 후 연락드리겠습니다.`
  });
  try {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://dkansim.com").replace(/\/$/, "");
    await sendAdminAlertSms(
      `[A/S 요청] ${created.name}님 · ${created.apartmentName ?? created.address}\n${logContext}\n출장비 무료 자동적용\n${appUrl}/admin/reservations?id=${created.id}`
    );
  } catch (err) {
    await appendActivityLog({
      action: "reservation_created",
      reservationId: created.id,
      message: `A/S 요청 관리자 SMS 알림 발송 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`
    });
  }

  return confirmed ?? created;
}
