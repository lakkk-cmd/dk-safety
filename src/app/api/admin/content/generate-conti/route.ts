import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { planVideoScenes } from "@/lib/video-pipeline";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  let id: string;
  try {
    const body = (await request.json()) as { id?: string };
    id = body.id ?? "";
  } catch {
    return NextResponse.json({ message: "요청 형식이 잘못되었습니다." }, { status: 400 });
  }

  if (!id) {
    return NextResponse.json({ message: "id가 필요합니다." }, { status: 400 });
  }

  const supabase = requireAgentSupabase();

  const { data: item, error: fetchErr } = await supabase
    .from("content_youtube_queue")
    .select("id, title, script")
    .eq("id", id)
    .single();

  if (fetchErr || !item) {
    return NextResponse.json({ message: "항목을 찾을 수 없습니다." }, { status: 404 });
  }

  if (!item.script) {
    return NextResponse.json({ message: "스크립트가 없습니다. 초안 생성 후 다시 시도하세요." }, { status: 400 });
  }

  try {
    const { scenes, contiSummary, visualMotif } = await planVideoScenes(item.title, item.script);

    await supabase
      .from("content_youtube_queue")
      .update({
        conti_summary: contiSummary || null,
        scenes: scenes.length > 0 ? scenes : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ contiSummary, visualMotif, scenes });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "콘티 생성 실패" },
      { status: 500 },
    );
  }
}
