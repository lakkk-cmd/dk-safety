import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { updateCrmCustomer } from "@/lib/crm-db";

export const dynamic = "force-dynamic";

/** 고객 프로필(이름/연락처/주소) 수정 — 이 테이블만 관리자가 직접 바꾸는 대상이며, 연결된
 * 예약·상담기록의 스냅샷 필드(name/phone/address)는 건드리지 않는다(2026-09-10 설계 결정). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  const { id } = await context.params;
  try {
    const body = (await request.json()) as { name?: string; phone?: string; address?: string | null };
    const name = body.name?.trim();
    const phone = body.phone?.trim();
    if (!name || !phone) {
      return NextResponse.json({ error: "이름과 연락처는 비워둘 수 없습니다." }, { status: 400 });
    }
    await updateCrmCustomer(id, { name, phone, address: body.address ?? null });
    return NextResponse.json({ message: "수정되었습니다." });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
