/**
 * 기사 작업완료 화면의 현장 정산 UI(재료비 다중선택 + 작업비 난이도 단일선택)에서 쓰는
 * 읽기 전용 카탈로그 조회 — material_catalog/labor_tier_catalog 중 active=true만 반환.
 * 관리자 CRUD 엔드포인트(/api/admin/materials, /api/admin/labor-tiers)는 admin 세션 전용이라
 * 기사 세션에서는 접근할 수 없으므로 별도 read-only 라우트로 분리한다.
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
    const [materialsRes, laborTiersRes] = await Promise.all([
      supabase
        .from("material_catalog")
        .select("id, name, unit_price, display_order")
        .eq("active", true)
        .order("display_order", { ascending: true }),
      supabase
        .from("labor_tier_catalog")
        .select("id, label, max_minutes, amount, display_order")
        .eq("active", true)
        .order("display_order", { ascending: true })
    ]);
    if (materialsRes.error) {
      return NextResponse.json({ message: materialsRes.error.message }, { status: 500 });
    }
    if (laborTiersRes.error) {
      return NextResponse.json({ message: laborTiersRes.error.message }, { status: 500 });
    }
    return NextResponse.json({ materials: materialsRes.data ?? [], laborTiers: laborTiersRes.data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 }
    );
  }
}
