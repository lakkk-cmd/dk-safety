import { requireAgentSupabase } from "@/lib/agent-db";
import { BUSINESS_CONTEXT, callClaudeCustom, extractJsonBlock } from "@/lib/agents";
import { createGithubIssue, GITHUB_ISSUES_ENABLED } from "@/lib/github-issues";
import {
  KAKAO_MEMO_ENABLED,
  notifyImprovementRequestCompleted,
  notifyImprovementRequestReceived,
} from "@/lib/kakao-publish";

export type ImprovementRequestType = "feature" | "bug" | "ui" | "other";
export type ImprovementRequestStatus =
  | "received"
  | "analyzing"
  | "issue_created"
  | "in_progress"
  | "completed"
  | "failed";

export type ImprovementRequest = {
  id: string;
  type: ImprovementRequestType;
  content: string;
  screenshot_url: string | null;
  ai_title: string | null;
  ai_analysis: string | null;
  status: ImprovementRequestStatus;
  github_issue_url: string | null;
  github_issue_number: number | null;
  github_pr_url: string | null;
  error_message: string | null;
  acknowledged: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const COLUMNS =
  "id, type, content, screenshot_url, ai_title, ai_analysis, status, github_issue_url, github_issue_number, github_pr_url, error_message, acknowledged, created_at, updated_at, completed_at";

const TYPE_LABELS: Record<ImprovementRequestType, string> = {
  feature: "기능 추가",
  bug: "버그 수정",
  ui: "UI 변경",
  other: "기타",
};

export async function createImprovementRequest(input: {
  type: ImprovementRequestType;
  content: string;
  screenshotUrl?: string | null;
}): Promise<ImprovementRequest> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("improvement_requests")
    .insert({
      type: input.type,
      content: input.content,
      screenshot_url: input.screenshotUrl ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as ImprovementRequest;
}

export async function listImprovementRequests(limit = 50): Promise<ImprovementRequest[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("improvement_requests")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ImprovementRequest[];
}

export async function countUnacknowledgedImprovementRequests(): Promise<number> {
  const supabase = requireAgentSupabase();
  const { count, error } = await supabase
    .from("improvement_requests")
    .select("id", { count: "exact", head: true })
    .eq("acknowledged", false);
  if (error) throw error;
  return count ?? 0;
}

export async function acknowledgeAllImprovementRequests(): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase
    .from("improvement_requests")
    .update({ acknowledged: true })
    .eq("acknowledged", false);
  if (error) throw error;
}

async function patchImprovementRequest(id: string, patch: Record<string, unknown>): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase
    .from("improvement_requests")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

const ANALYSIS_SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피) dkansim.com 플랫폼의 시니어 개발자입니다.
${BUSINESS_CONTEXT}
[기술 스택]
- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Storage), Vercel 배포

대장이 hq.dkansim.com에서 제출한 개선 요청을 분석하여 GitHub Issue로 등록할 내용을 작성한다.
다음 JSON 형식으로만 응답하라 (마크다운 코드블록 없이 순수 JSON):
{"title": "GitHub Issue 제목 (50자 이내, 한국어, 요청 핵심을 한 줄로 요약)", "analysis": "## 요청 요약\\n...\\n\\n## 영향 범위\\n...\\n\\n## 제안 접근법\\n...\\n\\n## 작업 항목\\n- [ ] ...\\n- [ ] ..."}`;

/** Claude로 개선 요청을 분석하고 GitHub Issue를 생성한다. */
export async function analyzeAndFileImprovementRequest(id: string): Promise<ImprovementRequest> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase.from("improvement_requests").select(COLUMNS).eq("id", id).single();
  if (error) throw error;
  const request = data as ImprovementRequest;

  try {
    await patchImprovementRequest(id, { status: "analyzing" });

    const userPrompt = `[요청 유형] ${TYPE_LABELS[request.type]}
[요청 내용]
${request.content}
${request.screenshot_url ? `\n[스크린샷] ${request.screenshot_url}` : ""}`;

    const raw = await callClaudeCustom(ANALYSIS_SYSTEM_PROMPT, userPrompt, 3000, 120_000);
    const parsed = JSON.parse(extractJsonBlock(raw) || raw) as { title?: string; analysis?: string };
    const title = parsed.title?.trim() || `[개선요청] ${TYPE_LABELS[request.type]}`;
    const analysis = parsed.analysis?.trim() || request.content;

    let githubIssueUrl: string | null = null;
    let githubIssueNumber: number | null = null;
    let status: ImprovementRequestStatus = "issue_created";
    let errorMessage: string | null = null;

    if (GITHUB_ISSUES_ENABLED) {
      const body = `${analysis}

---

**요청 유형**: ${TYPE_LABELS[request.type]}
**원본 요청**:
${request.content}
${request.screenshot_url ? `\n**스크린샷**: ${request.screenshot_url}` : ""}

_이 이슈는 hq.dkansim.com 개선 요청 시스템(#${request.id})에서 자동 생성되었습니다._`;

      const issue = await createGithubIssue({
        title,
        body,
        labels: ["ai-improvement", request.type],
      });
      githubIssueUrl = issue.url;
      githubIssueNumber = issue.number;
    } else {
      status = "failed";
      errorMessage = "GITHUB_TOKEN이 설정되지 않아 이슈를 생성하지 못했습니다.";
    }

    await patchImprovementRequest(id, {
      ai_title: title,
      ai_analysis: analysis,
      github_issue_url: githubIssueUrl,
      github_issue_number: githubIssueNumber,
      status,
      error_message: errorMessage,
    });

    if (KAKAO_MEMO_ENABLED && githubIssueUrl) {
      try {
        await notifyImprovementRequestReceived(title, githubIssueUrl);
      } catch {
        // 알림 실패는 핵심 흐름에 영향 없음
      }
    }

    const { data: updated, error: refetchError } = await supabase
      .from("improvement_requests")
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (refetchError) throw refetchError;
    return updated as ImprovementRequest;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await patchImprovementRequest(id, { status: "failed", error_message: message.slice(0, 500) });
    throw err;
  }
}

/** GitHub Issue 번호로 개선 요청을 조회한다 (워크플로우 콜백용). */
export async function getImprovementRequestByIssueNumber(issueNumber: number): Promise<ImprovementRequest | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("improvement_requests")
    .select(COLUMNS)
    .eq("github_issue_number", issueNumber)
    .maybeSingle();
  if (error) throw error;
  return (data as ImprovementRequest) ?? null;
}

/** GH Actions 워크플로우 B(배포 완료) 콜백 — 상태를 갱신하고 완료 알림을 보낸다. */
export async function completeImprovementRequest(issueNumber: number, prUrl: string): Promise<ImprovementRequest | null> {
  const request = await getImprovementRequestByIssueNumber(issueNumber);
  if (!request) return null;

  await patchImprovementRequest(request.id, {
    status: "completed",
    github_pr_url: prUrl,
    completed_at: new Date().toISOString(),
    acknowledged: false,
  });

  if (KAKAO_MEMO_ENABLED) {
    try {
      await notifyImprovementRequestCompleted(request.ai_title ?? request.content.slice(0, 50), prUrl);
    } catch {
      // 알림 실패는 핵심 흐름에 영향 없음
    }
  }

  const supabase = requireAgentSupabase();
  const { data, error } = await supabase.from("improvement_requests").select(COLUMNS).eq("id", request.id).single();
  if (error) throw error;
  return data as ImprovementRequest;
}

/** GH Actions 워크플로우 실패 콜백 — 상태를 failed로 갱신한다. */
export async function failImprovementRequest(issueNumber: number, errorMessage: string): Promise<void> {
  const request = await getImprovementRequestByIssueNumber(issueNumber);
  if (!request) return;
  await patchImprovementRequest(request.id, {
    status: "failed",
    error_message: errorMessage.slice(0, 500),
    acknowledged: false,
  });
}
