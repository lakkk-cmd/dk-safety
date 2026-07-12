/**
 * 재료비 정액 카탈로그 `material_catalog` — electrical_tips와 동일 패턴.
 * GET: 전체 행 조회, display_order ASC (active 필터 없음 — 관리자는 비활성 항목도 봐야 함)
 * POST: name, unit_price, display_order, active 로 INSERT
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("material_catalog")
      .select("id, name, unit_price, active, display_order, created_at, updated_at")
      .order("display_order", { ascending: true });
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    return NextResponse.json({ materials: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const unitPrice = Number(body.unit_price);
  if (!name) {
    return NextResponse.json({ message: "품목명은 필수입니다." }, { status: 400 });
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return NextResponse.json({ message: "자재비는 0 이상의 숫자여야 합니다." }, { status: 400 });
  }
  const displayOrder = Number.isFinite(Number(body.display_order)) ? Math.round(Number(body.display_order)) : 0;
  const active = body.active === undefined ? true : Boolean(body.active);

  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("material_catalog")
      .insert({ name, unit_price: Math.round(unitPrice), active, display_order: displayOrder })
      .select("id, name, unit_price, active, display_order, created_at, updated_at")
      .single();
    if (error || !data) {
      return NextResponse.json({ message: error?.message ?? "생성 실패" }, { status: 500 });
    }
    return NextResponse.json({ material: data });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 }
    );
  }
}
