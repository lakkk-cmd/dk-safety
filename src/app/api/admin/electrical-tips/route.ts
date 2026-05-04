/**
 * 생활전기정보 `electrical_tips` — `src/app/api/admin/pricing-catalog/route.ts` 와 동일하게
 * 모든 핸들러에서 `isAdminAuthenticated()` 후 DB 작업합니다.
 *
 * GET: `requireSupabaseAdmin()` 클라이언트로 전체 행 조회, `display_order` ASC (`is_published` 필터 없음)
 * POST: `title`, `summary`, `content`, `category`, `service_type`, `display_order`, `is_published` 로 INSERT
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireSupabaseAdmin } from "@/lib/supabase-pg";

const CATEGORY_SET = new Set(["safety", "saving", "selfcheck", "seasonal"]);
const SERVICE_SET = new Set(["VISIT", "DIAGNOSIS", "LEAKAGE", "OUTLET", "LIGHT"]);

function normalizeServiceType(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim();
  if (!SERVICE_SET.has(s)) return null;
  return s;
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("electrical_tips")
      .select(
        "id, category, title, summary, content, image_url, service_type, is_published, display_order, created_at, updated_at"
      )
      .order("display_order", { ascending: true });
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    return NextResponse.json({ tips: data ?? [] });
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
  const category = String(body.category ?? "").trim();
  const title = String(body.title ?? "").trim();
  const summary = String(body.summary ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (!CATEGORY_SET.has(category)) {
    return NextResponse.json({ message: "유효하지 않은 category입니다." }, { status: 400 });
  }
  if (!title || !summary || !content) {
    return NextResponse.json({ message: "제목·요약·본문은 필수입니다." }, { status: 400 });
  }
  const displayOrder = Number.isFinite(Number(body.display_order)) ? Math.round(Number(body.display_order)) : 0;
  const isPublished = Boolean(body.is_published);
  const serviceType = normalizeServiceType(body.service_type);

  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("electrical_tips")
      .insert({
        category,
        title,
        summary,
        content,
        service_type: serviceType,
        is_published: isPublished,
        display_order: displayOrder
      })
      .select(
        "id, category, title, summary, content, image_url, service_type, is_published, display_order, created_at, updated_at"
      )
      .single();
    if (error || !data) {
      return NextResponse.json({ message: error?.message ?? "생성 실패" }, { status: 500 });
    }
    return NextResponse.json({ tip: data });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 }
    );
  }
}
