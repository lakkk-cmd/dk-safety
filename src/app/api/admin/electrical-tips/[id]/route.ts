/**
 * 생활전기정보 단건 — `isAdminAuthenticated()` 필수.
 * PATCH: body에 담긴 필드만 부분 업데이트 (`is_published` 토글 포함)
 * DELETE: `id` 행 삭제
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireSupabaseAdmin } from "@/lib/supabase-pg";

const CATEGORY_SET = new Set(["safety", "saving", "selfcheck", "seasonal"]);
const SERVICE_SET = new Set(["VISIT", "DIAGNOSIS", "LEAKAGE", "OUTLET", "LIGHT"]);

function normalizeServiceType(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const s = String(value).trim();
  if (!SERVICE_SET.has(s)) return undefined;
  return s;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const { id } = await context.params;
  const tipId = id?.trim() ?? "";
  if (!tipId) {
    return NextResponse.json({ message: "id가 필요합니다." }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.category !== undefined) {
    const category = String(body.category ?? "").trim();
    if (!CATEGORY_SET.has(category)) {
      return NextResponse.json({ message: "유효하지 않은 category입니다." }, { status: 400 });
    }
    patch.category = category;
  }
  if (body.title !== undefined) {
    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ message: "제목이 비어 있습니다." }, { status: 400 });
    }
    patch.title = title;
  }
  if (body.summary !== undefined) {
    const summary = String(body.summary ?? "").trim();
    if (!summary) {
      return NextResponse.json({ message: "요약이 비어 있습니다." }, { status: 400 });
    }
    patch.summary = summary;
  }
  if (body.content !== undefined) {
    const content = String(body.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ message: "본문이 비어 있습니다." }, { status: 400 });
    }
    patch.content = content;
  }
  if (body.image_url !== undefined) {
    const imageUrlRaw = body.image_url;
    patch.image_url =
      imageUrlRaw === null || imageUrlRaw === undefined || imageUrlRaw === ""
        ? null
        : String(imageUrlRaw).trim() || null;
  }
  if (body.service_type !== undefined) {
    const st = normalizeServiceType(body.service_type);
    if (st === undefined && body.service_type !== null && body.service_type !== "") {
      return NextResponse.json({ message: "유효하지 않은 service_type입니다." }, { status: 400 });
    }
    patch.service_type = st ?? null;
  }
  if (body.display_order !== undefined) {
    const n = Number(body.display_order);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ message: "display_order는 숫자여야 합니다." }, { status: 400 });
    }
    patch.display_order = Math.round(n);
  }
  if (body.is_published !== undefined) {
    patch.is_published = Boolean(body.is_published);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ message: "갱신할 필드가 없습니다." }, { status: 400 });
  }

  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("electrical_tips")
      .update(patch)
      .eq("id", tipId)
      .select(
        "id, category, title, summary, content, image_url, service_type, is_published, display_order, created_at, updated_at"
      )
      .maybeSingle();
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ message: "해당 콘텐츠를 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json({ tip: data });
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
  const tipId = id?.trim() ?? "";
  if (!tipId) {
    return NextResponse.json({ message: "id가 필요합니다." }, { status: 400 });
  }
  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase.from("electrical_tips").delete().eq("id", tipId).select("id");
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    if (!data?.length) {
      return NextResponse.json({ message: "해당 콘텐츠를 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 }
    );
  }
}
