import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { formatMemoryForPrompt, loadRecentMemory, type MemoryCategory } from "@/lib/org-memory";

const DASHBOARD_LIMIT = 20;

function byCategory(entries: Awaited<ReturnType<typeof loadRecentMemory>>, category: MemoryCategory): string[] {
  return entries.filter((e) => e.category === category).map((e) => e.content);
}

/** /hq/report의 "조직 기억" 대시보드 — 예전 agent_memory.structured_v1과 같은 응답 모양을
 *  유지해(hq-command-center-panel.tsx 변경 없이) 통합 테이블(agent_memory_entries)에서 채운다. */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const entries = await loadRecentMemory({ limit: DASHBOARD_LIMIT * 5 });
    const notes = byCategory(entries, "note");
    const structured = {
      strategicThemes: byCategory(entries, "theme").slice(-DASHBOARD_LIMIT),
      decisions: byCategory(entries, "decision").slice(-DASHBOARD_LIMIT),
      kpis: byCategory(entries, "kpi").slice(-DASHBOARD_LIMIT),
      openQuestions: byCategory(entries, "open_question").slice(-DASHBOARD_LIMIT),
      feedbackNotes: notes.filter((n) => n.startsWith("[대장 피드백 반영")).slice(-3).join("\n"),
    };
    return NextResponse.json({
      structured,
      promptPreview: formatMemoryForPrompt(entries),
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}
