import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgCreateOrder } from "@/lib/orders-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }

  let body: {
    aptId?: string;
    reservationId?: string;
    residentInfo?: { name?: string; phone?: string; dong?: string; ho?: string };
    baseFee?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const aptId = body.aptId?.trim() ?? "";
  const residentInfo = body.residentInfo;
  if (!aptId || !residentInfo?.name || !residentInfo.phone || !residentInfo.dong || !residentInfo.ho) {
    return NextResponse.json({ message: "aptId와 입주민 정보가 필요합니다." }, { status: 400 });
  }

  // 입주민 접수 화면에서도 생성 가능하게 허용하되, 관리자 인증이 있으면 추가 검증 경로로 재사용 가능.
  if (await isAdminAuthenticated()) {
    // noop: explicit branch keeps admin/auth flow future-proof.
  }

  try {
    const order = await pgCreateOrder({
      aptId,
      reservationId: body.reservationId?.trim() || undefined,
      residentInfo: {
        name: residentInfo.name.trim(),
        phone: residentInfo.phone.trim(),
        dong: residentInfo.dong.trim(),
        ho: residentInfo.ho.trim()
      },
      baseFee: body.baseFee
    });
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "주문 생성 실패" }, { status: 500 });
  }
}
