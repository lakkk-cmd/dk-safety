import { NextResponse } from "next/server";
import { appendActivityLog } from "@/lib/activity-log";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  normalizePhone,
  normalizePreferredTimeForApi,
  validateAdminOfflineReservationInput
} from "@/lib/reservation-validation";
import { pgAdminCreateOfflineReservation } from "@/lib/reservations-pg";
import { readPaymentSettings } from "@/lib/payment-settings";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { pushReservationProgressNotifications } from "@/lib/live-notify";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase 예약 DB가 활성화된 경우에만 사용할 수 있습니다." }, { status: 400 });
  }

  const body = (await request.json()) as {
    name?: string;
    phone?: string;
    address?: string;
    apartmentId?: string;
    apartmentName?: string;
    apartmentCode?: string;
    serviceType?: string;
    preferredDate?: string;
    preferredTime?: string;
    detail?: string;
    priority?: "normal" | "emergency";
  };

  const err = validateAdminOfflineReservationInput({
    name: body.name,
    phone: body.phone,
    address: body.address,
    serviceType: body.serviceType,
    preferredDate: body.preferredDate,
    preferredTime: body.preferredTime,
    detail: body.detail
  });
  if (err) {
    return NextResponse.json({ message: err }, { status: 400 });
  }

  const paymentSettings = await readPaymentSettings();
  const preferredTime = normalizePreferredTimeForApi(body.preferredTime);

  try {
    const created = await pgAdminCreateOfflineReservation({
      name: body.name!.trim(),
      phone: normalizePhone(body.phone!.trim()),
      address: body.address!.trim(),
      apartmentId: body.apartmentId?.trim() || undefined,
      apartmentName: body.apartmentName?.trim() || undefined,
      apartmentCode: body.apartmentCode?.trim() || undefined,
      serviceType: body.serviceType!.trim(),
      preferredDate: body.preferredDate!.trim(),
      preferredTime: preferredTime,
      detail: body.detail?.trim() || "오프라인 접수",
      imageUrls: [],
      priority: body.priority === "emergency" ? "emergency" : "normal",
      baseFee: paymentSettings.baseDispatchFeeOffline
    });

    await appendActivityLog({
      action: "reservation_created",
      reservationId: created.id,
      message: `${created.name} 고객 오프라인 접수가 등록되었습니다. (접수 상태)`
    });
    await pushReservationProgressNotifications({
      reservationId: created.id,
      customerName: created.name,
      customerPhone: created.phone,
      adminMessage: `${created.name}님 오프라인 접수가 관리자 화면에서 등록되었습니다.`,
      residentMessage: `${created.name}님 예약이 접수되었습니다.`
    });

    return NextResponse.json({ message: "오프라인 접수가 등록되었습니다.", reservation: created }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "등록에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
