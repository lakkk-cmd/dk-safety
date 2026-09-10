import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { mergeCrmCustomers } from "@/lib/crm-db";

export const dynamic = "force-dynamic";

/**
 * 동일인이 번호 변경 등으로 두 고객으로 나뉜 경우 관리자가 수동 병합(2026-09-10 신설). primaryId로
 * 지정한 고객이 대표로 남고, secondaryIds의 예약·상담기록·재상담알림은 전부 primary로 재연결된다.
 * secondary의 전화번호는 예전 번호로 보존되어, 그 번호로 다시 연락이 와도 같은 고객으로 인식된다.
 */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = (await request.json()) as { primaryId?: string; secondaryIds?: string[] };
    const primaryId = body.primaryId?.trim();
    const secondaryIds = Array.isArray(body.secondaryIds) ? body.secondaryIds.filter((id) => typeof id === "string" && id) : [];
    if (!primaryId || secondaryIds.length === 0) {
      return NextResponse.json({ error: "대표 고객과 병합할 고객을 선택해 주세요." }, { status: 400 });
    }
    await mergeCrmCustomers(primaryId, secondaryIds);
    return NextResponse.json({ message: `${secondaryIds.length}명을 병합했습니다.` });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
