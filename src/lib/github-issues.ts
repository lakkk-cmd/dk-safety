const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_REPO = "lakkk-cmd/dk-safety";

export const GITHUB_ISSUES_ENABLED = Boolean(process.env.GITHUB_TOKEN?.trim());

function getRepo(): string {
  return process.env.GITHUB_REPO?.trim() || DEFAULT_REPO;
}

function getToken(): string {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GITHUB_TOKEN이 설정되지 않았습니다.");
  return token;
}

async function githubFetch(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`GitHub API ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res;
}

export type GithubIssue = {
  number: number;
  url: string;
};

/** 개선 요청을 GitHub Issue로 생성한다. */
export async function createGithubIssue(params: {
  title: string;
  body: string;
  labels?: string[];
}): Promise<GithubIssue> {
  const res = await githubFetch(`/repos/${getRepo()}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      labels: params.labels ?? [],
    }),
  });
  const json = (await res.json()) as { html_url: string; number: number };
  return { url: json.html_url, number: json.number };
}

/** 이슈에 댓글을 추가한다 (완료/실패 알림용). */
export async function addGithubIssueComment(issueNumber: number, body: string): Promise<void> {
  await githubFetch(`/repos/${getRepo()}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/** 이슈를 닫는다. */
export async function closeGithubIssue(issueNumber: number): Promise<void> {
  await githubFetch(`/repos/${getRepo()}/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

const MAX_FILE_BYTES = 50_000;

/** 저장소 파일을 읽기 전용으로 조회한다 (Contents API, base64 디코드). */
export async function readGithubFile(path: string, ref?: string): Promise<string> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const res = await githubFetch(`/repos/${getRepo()}/contents/${path}${query}`, { method: "GET" });
  const json = (await res.json()) as { content?: string; encoding?: string; size?: number; type?: string };
  if (json.type && json.type !== "file") {
    throw new Error(`${path}는 파일이 아닙니다 (type: ${json.type}).`);
  }
  if (!json.content || json.encoding !== "base64") {
    throw new Error(`${path} 콘텐츠를 읽을 수 없습니다.`);
  }
  const decoded = Buffer.from(json.content, "base64").toString("utf-8");
  return decoded.length > MAX_FILE_BYTES
    ? `${decoded.slice(0, MAX_FILE_BYTES)}\n\n...(파일이 너무 커서 ${MAX_FILE_BYTES}자까지만 표시)`
    : decoded;
}
