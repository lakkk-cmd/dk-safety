import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady, requireSupabaseAdmin } from "@/lib/supabase-pg";
import { SERVICE_ITEM_SELECT_COLUMNS, sanitizeServiceItemPayload } from "@/lib/service-items-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ message: "Supabase DB 미연결" }, { status: 503 });

  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("service_items")
    .select(SERVICE_ITEM_SELECT_COLUMNS)
    .order("display_order", { ascending: true });
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ message: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const payload = sanitizeServiceItemPayload(body);
    if (!payload.service_type || !payload.name) {
      return NextResponse.json({ message: "서비스 유형과 이름은 필수입니다." }, { status: 400 });
    }
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("service_items")
      .insert(payload)
      .select(SERVICE_ITEM_SELECT_COLUMNS)
      .single();
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ item: data });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "생성 실패" }, { status: 500 });
  }
}
