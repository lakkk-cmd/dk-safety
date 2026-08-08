import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { appendActivityLog } from "@/lib/activity-log";
import { pushReservationProgressNotifications } from "@/lib/live-notify";
import { pgChangeReservationServiceType, type ToggleableServiceType } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

const TOGGLEABLE_TYPES = new Set<ToggleableServiceType>(["점검/수리", "단순기구교체"]);

/**
 * 고객이 앱에서 잘못된 버튼(점검/수리 ↔ 단순기구교체)을 눌러 접수했을 때 관리자가 바로잡는
 * 전용 엔드포인트. `/admin/reservations`에서만 호출한다.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "서비스 유형 변경은 Supabase DB 모드에서만 지원됩니다." }, { status: 400 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { serviceType?: string } | null;
  const serviceType = body?.serviceType?.trim() ?? "";
  if (!TOGGLEABLE_TYPES.has(serviceType as ToggleableServiceType)) {
    return NextResponse.json({ message: "서비스 유형은 '점검/수리' 또는 '단순기구교체'만 가능합니다." }, { status: 400 });
  }

  try {
    const result = await pgChangeReservationServiceType(id, serviceType as ToggleableServiceType);

    await appendActivityLog({
      action: "status_updated",
      reservationId: id,
      message: `${result.reservation.name} 고객 예약 서비스 유형이 '${result.previousServiceType}' → '${serviceType}'로 변경되었습니다. (요금 ${result.previousBaseFee.toLocaleString()}원 → ${result.newBaseFee.toLocaleString()}원${result.orderUpdated ? ", 주문 예약금도 함께 갱신" : ""})`
    });

    await pushReservationProgressNotifications({
      reservationId: id,
      customerName: result.reservation.name,
      customerPhone: result.reservation.phone,
      adminMessage: `${result.reservation.name} 예약이 '${result.previousServiceType}' → '${serviceType}'로 정정되었습니다. 출장비: ${result.newBaseFee.toLocaleString()}원.`,
      residentMessage: `${result.reservation.name}님 예약 내용이 '${serviceType}'(으)로 정정되었습니다. 출장비: ${result.newBaseFee.toLocaleString()}원.`
    });

    return NextResponse.json({
      message: "서비스 유형이 변경되었습니다.",
      reservation: result.reservation,
      previousServiceType: result.previousServiceType,
      previousBaseFee: result.previousBaseFee,
      newBaseFee: result.newBaseFee,
      orderUpdated: result.orderUpdated
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "서비스 유형 변경 실패" }, { status: 400 });
  }
}
