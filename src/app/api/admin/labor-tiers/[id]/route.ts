/**
 * 작업비 난이도 정액표 단건 — isAdminAuthenticated() 필수.
 * PATCH: body에 담긴 필드만 부분 업데이트 (active 토글 포함)
 * DELETE: id 행 삭제
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const { id } = await context.params;
  const tierId = id?.trim() ?? "";
  if (!tierId) {
    return NextResponse.json({ message: "id가 필요합니다." }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const label = String(body.label ?? "").trim();
    if (!label) {
      return NextResponse.json({ message: "난이도명이 비어 있습니다." }, { status: 400 });
    }
    patch.label = label;
  }
  if (body.max_minutes !== undefined) {
    const maxMinutes = Number(body.max_minutes);
    if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) {
      return NextResponse.json({ message: "소요시간(분)은 0보다 큰 숫자여야 합니다." }, { status: 400 });
    }
    patch.max_minutes = Math.round(maxMinutes);
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ message: "작업비는 0 이상의 숫자여야 합니다." }, { status: 400 });
    }
    patch.amount = Math.round(amount);
  }
  if (body.display_order !== undefined) {
    const n = Number(body.display_order);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ message: "display_order는 숫자여야 합니다." }, { status: 400 });
    }
    patch.display_order = Math.round(n);
  }
  if (body.active !== undefined) {
    patch.active = Boolean(body.active);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ message: "갱신할 필드가 없습니다." }, { status: 400 });
  }

  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("labor_tier_catalog")
      .update(patch)
      .eq("id", tierId)
      .select("id, label, max_minutes, amount, active, display_order, created_at, updated_at")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ message: "해당 난이도를 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json({ laborTier: data });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "저장 실패" },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const { id } = await context.params;
  const tierId = id?.trim() ?? "";
  if (!tierId) {
    return NextResponse.json({ message: "id가 필요합니다." }, { status: 400 });
  }
  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase.from("labor_tier_catalog").delete().eq("id", tierId).select("id");
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    if (!data?.length) {
      return NextResponse.json({ message: "해당 난이도를 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 }
    );
  }
}
