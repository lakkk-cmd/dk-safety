/**
 * 작업비 난이도 정액표 `labor_tier_catalog` — materials와 동일 패턴.
 * GET: 전체 행 조회, display_order ASC (active 필터 없음 — 관리자는 비활성 항목도 봐야 함)
 * POST: label, max_minutes, amount, display_order, active 로 INSERT
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
      .from("labor_tier_catalog")
      .select("id, label, max_minutes, amount, active, display_order, created_at, updated_at")
      .order("display_order", { ascending: true });
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    return NextResponse.json({ laborTiers: data ?? [] });
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
  const label = String(body.label ?? "").trim();
  const maxMinutes = Number(body.max_minutes);
  const amount = Number(body.amount);
  if (!label) {
    return NextResponse.json({ message: "난이도명은 필수입니다." }, { status: 400 });
  }
  if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) {
    return NextResponse.json({ message: "소요시간(분)은 0보다 큰 숫자여야 합니다." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ message: "작업비는 0 이상의 숫자여야 합니다." }, { status: 400 });
  }
  const displayOrder = Number.isFinite(Number(body.display_order)) ? Math.round(Number(body.display_order)) : 0;
  const active = body.active === undefined ? true : Boolean(body.active);

  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("labor_tier_catalog")
      .insert({
        label,
        max_minutes: Math.round(maxMinutes),
        amount: Math.round(amount),
        active,
        display_order: displayOrder
      })
      .select("id, label, max_minutes, amount, active, display_order, created_at, updated_at")
      .single();
    if (error || !data) {
      return NextResponse.json({ message: error?.message ?? "생성 실패" }, { status: 500 });
    }
    return NextResponse.json({ laborTier: data });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 }
    );
  }
}
