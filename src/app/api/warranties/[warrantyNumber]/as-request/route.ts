import { NextResponse } from "next/server";
import { pgFindWarrantyByNumber } from "@/lib/warranty-pg";
import { createReservation, hasReservationTimeConflict } from "@/lib/reservations-store";
import { pgFindReservationById } from "@/lib/reservations-pg";
import { validateReservationInput } from "@/lib/reservation-validation";
import { readPaymentSettings } from "@/lib/payment-settings";
import { appendActivityLog } from "@/lib/activity-log";
import { pushReservationProgressNotifications } from "@/lib/live-notify";
import { sendAdminAlertSms } from "@/lib/solapi-agent";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { applyHolidaySurcharge } from "@/lib/holiday-surcharge";

const AS_SERVICE_TYPE = "A/S 재방문";

export async function POST(request: Request, context: { params: Promise<{ warrantyNumber: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { warrantyNumber } = await context.params;
  const warranty = await pgFindWarrantyByNumber(warrantyNumber);
  if (!warranty) {
    return NextResponse.json({ message: "보증서를 찾을 수 없습니다." }, { status: 404 });
  }
  if (warranty.status !== "ISSUED") {
    return NextResponse.json({ message: "정상 발급된 보증서에 대해서만 A/S를 신청할 수 있습니다." }, { status: 400 });
  }

  const original = await pgFindReservationById(warranty.reservationId);
  if (!original) {
    return NextResponse.json({ message: "원본 예약을 찾을 수 없습니다." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    detail?: string;
    preferredDate?: string;
    preferredTime?: string;
  };

  const validationError = validateReservationInput({
    name: original.name,
    phone: original.phone,
    address: original.address,
    serviceType: AS_SERVICE_TYPE,
    preferredDate: body.preferredDate,
    preferredTime: body.preferredTime,
    detail: body.detail
  });
  if (validationError) {
    return NextResponse.json({ message: validationError }, { status: 400 });
  }

  const hasConflict = await hasReservationTimeConflict(body.preferredDate!.trim(), body.preferredTime!.trim());
  if (hasConflict) {
    return NextResponse.json({ message: "선택하신 방문 요청시간은 이미 예약되어 있습니다. 다른 시간을 선택해주세요." }, { status: 409 });
  }

  const paymentSettings = await readPaymentSettings();
  const detail = `[A/S 요청 · 원 보증서 ${warranty.warrantyNumber}] ${body.detail!.trim()}`.slice(0, 500);

  const created = await createReservation({
    name: original.name,
    apartmentId: original.apartmentId ?? undefined,
    apartmentName: original.apartmentName ?? undefined,
    apartmentCode: original.apartmentCode ?? undefined,
    phone: original.phone,
    address: original.address,
    serviceType: AS_SERVICE_TYPE,
    preferredDate: body.preferredDate!.trim(),
    preferredTime: body.preferredTime!.trim(),
    detail,
    imageUrls: [],
    priority: "normal",
    baseFee: applyHolidaySurcharge(paymentSettings.baseDispatchFee, body.preferredDate!.trim()),
    asSourceReservationId: original.id
  });

  await appendActivityLog({
    action: "reservation_created",
    reservationId: created.id,
    message: `${created.name} 고객 A/S 요청이 접수되었습니다. (원 보증서 ${warranty.warrantyNumber})`
  });
  await pushReservationProgressNotifications({
    reservationId: created.id,
    customerName: created.name,
    customerPhone: created.phone,
    adminMessage: `[A/S 요청] ${created.name}님이 보증서 ${warranty.warrantyNumber} 건에 대해 재방문을 요청했습니다. 출장비 면제 여부를 확인해주세요.`,
    residentMessage: `${created.name}님 A/S 요청이 접수되었습니다. 확인 후 연락드리겠습니다.`
  });
  try {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://dkansim.com").replace(/\/$/, "");
    await sendAdminAlertSms(
      `[A/S 요청] ${created.name}님 · ${created.apartmentName ?? created.address}\n원 보증서: ${warranty.warrantyNumber}\n${appUrl}/admin/reservations?id=${created.id}`
    );
  } catch (err) {
    await appendActivityLog({
      action: "reservation_created",
      reservationId: created.id,
      message: `A/S 요청 관리자 SMS 알림 발송 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`
    });
  }

  return NextResponse.json({ message: "A/S 요청이 접수되었습니다.", reservation: created }, { status: 201 });
}
