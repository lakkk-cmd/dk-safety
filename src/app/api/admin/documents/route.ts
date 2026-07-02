import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireAgentSupabase } from "@/lib/agent-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const docType = req.nextUrl.searchParams.get("doc_type");
  try {
    const supabase = requireAgentSupabase();
    let query = supabase
      .from("generated_documents")
      .select("id, title, doc_type, customer_name, pdf_url, docx_url, validation_score, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (docType) query = query.eq("doc_type", docType);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  try {
    const supabase = requireAgentSupabase();
    const { error } = await supabase.from("generated_documents").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
