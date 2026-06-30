import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ error: "GITHUB_TOKEN이 설정되지 않았습니다." }, { status: 500 });
  }

  let body: { path?: string; ref?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { path, ref = "main" } = body;
  if (!path) {
    return NextResponse.json({ error: "path 파라미터가 필요합니다." }, { status: 400 });
  }

  const repoStr = process.env.GITHUB_REPO?.trim() ?? "";
  const [owner, repo] = repoStr.split("/");
  if (!owner || !repo) {
    return NextResponse.json(
      { error: "GITHUB_REPO 환경변수가 'owner/repo' 형식으로 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    return NextResponse.json(
      { error: `GitHub API 실패: ${err.message ?? res.status}` },
      { status: res.status === 404 ? 404 : 500 },
    );
  }

  const data = (await res.json()) as {
    content?: string;
    encoding?: string;
    sha?: string;
    name?: string;
    size?: number;
  };
  const content =
    data.content && data.encoding === "base64"
      ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8")
      : (data.content ?? "");

  return NextResponse.json({ content, sha: data.sha, name: data.name, size: data.size });
}
