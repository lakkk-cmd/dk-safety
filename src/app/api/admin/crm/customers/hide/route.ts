import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { hideCrmCustomers } from "@/lib/crm-db";

export const dynamic = "force-dynamic";

/** 체크박스 "삭제" = 목록에서만 숨김(2026-09-10 결정) — 원본 예약·상담기록은 그대로 둔다. */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = (await request.json()) as { ids?: string[] };
    const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string" && id) : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "숨길 고객을 선택해 주세요." }, { status: 400 });
    }
    await hideCrmCustomers(ids);
    return NextResponse.json({ message: `${ids.length}명을 목록에서 숨겼습니다.` });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
