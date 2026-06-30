import { NextResponse } from "next/server";

function checkAuth(request: Request): boolean {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

function getRepoInfo(): { owner: string; repo: string } {
  const repoStr = process.env.GITHUB_REPO?.trim() ?? "";
  const [owner, repo] = repoStr.split("/");
  if (!owner || !repo) {
    throw new Error("GITHUB_REPO 환경변수가 'owner/repo' 형식으로 설정되지 않았습니다.");
  }
  return { owner, repo };
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ error: "GITHUB_TOKEN이 설정되지 않았습니다." }, { status: 500 });
  }

  let body: { path?: string; content?: string; message?: string; branch?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { path, content, message, branch = "main" } = body;
  if (!path || !content || !message) {
    return NextResponse.json({ error: "path, content, message 파라미터가 필요합니다." }, { status: 400 });
  }

  const { owner, repo } = getRepoInfo();
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // 기존 파일 SHA 조회 (수정 시 필요)
  let sha: string | undefined;
  const existingRes = await fetch(`${apiUrl}?ref=${branch}`, { headers: ghHeaders });
  if (existingRes.ok) {
    const existing = (await existingRes.json()) as { sha?: string };
    sha = existing.sha;
  }

  const payload: Record<string, unknown> = {
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch,
  };
  if (sha) payload.sha = sha;

  const res = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    return NextResponse.json(
      { error: `GitHub API 실패: ${err.message ?? res.status}` },
      { status: 500 },
    );
  }

  const data = (await res.json()) as {
    content?: { sha?: string };
    commit?: { html_url?: string };
  };
  return NextResponse.json({ success: true, sha: data.content?.sha, url: data.commit?.html_url });
}
