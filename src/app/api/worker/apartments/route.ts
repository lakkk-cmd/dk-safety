/**
 * 세대전기점검 입력화면의 단지 선택 드롭다운용 — 관리자 CRUD 엔드포인트(/api/admin/apartments)는
 * admin 세션 전용이라 기사 세션에서는 접근할 수 없으므로, catalogs 라우트와 동일한 패턴으로
 * 읽기 전용(id/name만) 별도 라우트를 둔다.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { requireSupabaseAdmin } from "@/lib/supabase-pg";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

export async function GET() {
  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("apartments")
      .select("id, name, electrical_safety_manager_name, insulation_resistance_threshold_mohm")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    return NextResponse.json({ apartments: data ?? [] });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}
