import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { CHAT_AGENT_GROUPS, CHAT_AGENTS, chatWithAgentPlus, loadChatHistory } from "@/lib/agent-chat";
import { isAgentSupabaseReady } from "@/lib/agent-db";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId")?.trim() || "cto";
  if (!CHAT_AGENTS.some((a) => a.id === agentId)) {
    return NextResponse.json({ message: `알 수 없는 에이전트: ${agentId}` }, { status: 400 });
  }

  try {
    const history = await loadChatHistory(agentId, 50);
    return NextResponse.json({ agents: CHAT_AGENTS, groups: CHAT_AGENT_GROUPS, history });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ message: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      agentId?: string;
      message?: string;
      attachmentUrl?: string;
      attachmentType?: string;
      webSearch?: boolean;
    };
    const agentId = body.agentId?.trim();
    const message = body.message?.trim() ?? "";
    const attachmentUrl = body.attachmentUrl?.trim();
    if (!agentId || !CHAT_AGENTS.some((a) => a.id === agentId)) {
      return NextResponse.json({ message: `알 수 없는 에이전트: ${agentId}` }, { status: 400 });
    }
    if (!message && !attachmentUrl) {
      return NextResponse.json({ message: "message 또는 첨부파일이 필요합니다." }, { status: 400 });
    }

    const reply = await chatWithAgentPlus(agentId, message, {
      attachment: attachmentUrl ? { url: attachmentUrl, mediaType: body.attachmentType ?? "application/octet-stream" } : undefined,
      webSearch: body.webSearch ?? false,
    });
    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "응답 생성 실패" },
      { status: 500 },
    );
  }
}
