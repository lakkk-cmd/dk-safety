import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { issueWalkInWarranty, pgCompleteWalkInReservation, pgMarkWalkInTaskCompleted } from "@/lib/reservations-pg";

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
    workerId: string;
    signaturePng: string;
    name: string;
    phone: string;
    serviceType: string;
    workDate: string;
    workTime: string;
    serviceSummary: string;
    finalAmount: number;
    sitePhotos?: string[];
    partsUsed?: boolean;
  };

  const {
    reservationId,
    workerId,
    signaturePng,
    name,
    phone,
    serviceType,
    serviceSummary,
    finalAmount,
    sitePhotos = [],
    partsUsed = false
  } = body;

  if (!reservationId || !workerId || !signaturePng || !name || !phone || !serviceType) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  try {
    // 1. 예약 상태 → 완료
    await pgCompleteWalkInReservation(reservationId, partsUsed);

    // 2. 배정된 작업(tasks) 행도 완료로 마감 — 기사수당정산/배정관제가 정확한 상태를 보게 한다
    await pgMarkWalkInTaskCompleted(reservationId, workerId, signaturePng);

    // 3. 보증서 발급 + 정산 확정 알림(문자) — pgIssueWarrantyAndSettle이 함께 처리한다
    const { warrantyNumber, verifyUrl, notifiedChannels } = await issueWalkInWarranty({
      reservationId,
      serviceType,
      serviceSummary: serviceSummary || serviceType,
      finalAmount,
      sitePhotos,
      partsUsed,
      customer: { name, phone },
      technicianId: workerId
    });

    const channelAddUrl = process.env.KAKAO_CHANNEL_ADD_URL?.trim() ?? null;

    return NextResponse.json({
      ok: true,
      warrantyNumber,
      verifyUrl,
      sentChannels: notifiedChannels,
      channelAddUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "완료 처리에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
