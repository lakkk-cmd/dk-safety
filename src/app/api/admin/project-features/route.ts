import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireAgentSupabase } from "@/lib/agent-db";
import { refreshProjectContext } from "@/lib/project-context";

export const dynamic = "force-dynamic";

// GET: 기능 목록 조회
export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const category = req.nextUrl.searchParams.get("category");
  const status = req.nextUrl.searchParams.get("status");

  try {
    const supabase = requireAgentSupabase();
    let query = supabase.from("project_features").select("*").order("category").order("status");
    if (category) query = query.eq("category", category);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST: 기능 추가
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { category, name, description, status, path, tech_stack, note } = body;
    if (!category || !name || !description) {
      return NextResponse.json({ error: "category, name, description 필수" }, { status: 400 });
    }

    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("project_features")
      .insert({
        category,
        name,
        description,
        status: status ?? "implemented",
        path: path ?? null,
        tech_stack: tech_stack ?? null,
        note: note ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await refreshProjectContext();
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH: 기능 상태/설명 변경 (implemented ↔ pending ↔ deprecated)
export async function PATCH(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  try {
    const { id, status, description } = await req.json();
    if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) update.status = status;
    if (description) update.description = description;

    const supabase = requireAgentSupabase();
    const { error } = await supabase.from("project_features").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await refreshProjectContext();
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
