/**
 * 재료비 정액 카탈로그 단건 — isAdminAuthenticated() 필수.
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
  const materialId = id?.trim() ?? "";
  if (!materialId) {
    return NextResponse.json({ message: "id가 필요합니다." }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ message: "품목명이 비어 있습니다." }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.unit_price !== undefined) {
    const unitPrice = Number(body.unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return NextResponse.json({ message: "자재비는 0 이상의 숫자여야 합니다." }, { status: 400 });
    }
    patch.unit_price = Math.round(unitPrice);
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
      .from("material_catalog")
      .update(patch)
      .eq("id", materialId)
      .select("id, name, unit_price, active, display_order, created_at, updated_at")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ message: "해당 품목을 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json({ material: data });
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
  const materialId = id?.trim() ?? "";
  if (!materialId) {
    return NextResponse.json({ message: "id가 필요합니다." }, { status: 400 });
  }
  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase.from("material_catalog").delete().eq("id", materialId).select("id");
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    if (!data?.length) {
      return NextResponse.json({ message: "해당 품목을 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 }
    );
  }
}
