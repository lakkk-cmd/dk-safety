import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { issueWalkInWarranty, pgCompleteWalkInReservation } from "@/lib/reservations-pg";

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

  const { reservationId, name, phone, serviceType, serviceSummary, finalAmount, sitePhotos = [] } = body;

  if (!reservationId || !name || !phone || !serviceType) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  // 1. 예약 상태 → 완료
  await pgCompleteWalkInReservation(reservationId);

  // 2. 보증서 발급 + 정산 확정 알림(문자) — pgIssueWarrantyAndSettle이 함께 처리한다
  const { warrantyNumber, verifyUrl, notifiedChannels } = await issueWalkInWarranty({
    reservationId,
    serviceType,
    serviceSummary: serviceSummary || serviceType,
    finalAmount,
    sitePhotos,
    customer: { name, phone }
  });

  const channelAddUrl = process.env.KAKAO_CHANNEL_ADD_URL?.trim() ?? null;

  return NextResponse.json({
    ok: true,
    warrantyNumber,
    verifyUrl,
    sentChannels: notifiedChannels,
    channelAddUrl
  });
}
