import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireAgentSupabase } from "@/lib/agent-db";

export const dynamic = "force-dynamic";

// GET: 전체 도메인 조회 (카테고리 필터 가능)
export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const category = req.nextUrl.searchParams.get("category");
  try {
    const supabase = requireAgentSupabase();
    let query = supabase.from("trusted_domains").select("*").order("category").order("name");
    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST: 도메인 추가
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  try {
    const { category, domain, name, note } = await req.json();
    if (!category || !domain || !name) {
      return NextResponse.json({ error: "category, domain, name 필수" }, { status: 400 });
    }

    const cleanDomain = String(domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("trusted_domains")
      .insert({ category, domain: cleanDomain, name, note: note ?? null })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH: 활성/비활성 토글
export async function PATCH(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  try {
    const { id, is_active } = await req.json();
    if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

    const supabase = requireAgentSupabase();
    const { error } = await supabase.from("trusted_domains").update({ is_active }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE: 도메인 삭제
export async function DELETE(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  try {
    const supabase = requireAgentSupabase();
    const { error } = await supabase.from("trusted_domains").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
