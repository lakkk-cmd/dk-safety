import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { issueWalkInWarranty, pgCompleteWalkInReservation } from "@/lib/reservations-pg";
import { notifyCustomerWorkCompleted } from "@/lib/customer-notification";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });
  }

  const body = (await request.json()) as {
    reservationId: string;
    name: string;
    phone: string;
    serviceType: string;
    workDate: string;
    workTime: string;
    serviceSummary: string;
    finalAmount: number;
    sitePhotos?: string[];
  };

  const { reservationId, name, phone, serviceType, workDate, workTime, serviceSummary, finalAmount, sitePhotos = [] } = body;

  if (!reservationId || !name || !phone || !serviceType) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  // 1. 예약 상태 → 완료
  await pgCompleteWalkInReservation(reservationId);

  // 2. 보증서 발급
  const { warrantyNumber, verifyUrl } = await issueWalkInWarranty({
    reservationId,
    serviceType,
    serviceSummary: serviceSummary || serviceType,
    finalAmount,
    sitePhotos
  });

  // 3. 카카오 알림톡 발송 (warranty number를 id로 사용 → /verify/{warrantyNumber})
  let sentChannels: string[] = [];
  try {
    sentChannels = await notifyCustomerWorkCompleted({
      id: warrantyNumber,
      name,
      phone,
      serviceType,
      preferredDate: workDate,
      preferredTime: workTime || "00:00"
    });
  } catch (err) {
    console.error("[walk-in complete] 알림 발송 실패:", err instanceof Error ? err.message : err);
  }

  const channelAddUrl = process.env.KAKAO_CHANNEL_ADD_URL?.trim() ?? null;

  return NextResponse.json({
    ok: true,
    warrantyNumber,
    verifyUrl,
    sentChannels,
    channelAddUrl
  });
}
