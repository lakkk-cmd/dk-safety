import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { isBomiAuthenticated } from "@/lib/bomi-auth";
import { createBomiActivityLogEntry, listBomiActivityLog } from "@/lib/bomi-db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isBomiAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const { id } = await params;
    const entries = await listBomiActivityLog(id);
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isBomiAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const { id } = await params;
    const body = (await request.json()) as { content?: string };
    const content = body.content?.trim();
    if (!content) {
      return NextResponse.json({ message: "기록 내용이 필요합니다." }, { status: 400 });
    }
    const entry = await createBomiActivityLogEntry({ customerId: id, content });
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "등록 실패" }, { status: 500 });
  }
}
