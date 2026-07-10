import { writeGithubFile } from "@/lib/full-agent-tools";

// Vercel 서버리스는 파일시스템이 요청 간 영구적이지 않으므로(worker/의 로컬 fs 쓰기와 다름),
// brain/raw/에 결과를 남길 때는 기존 자가개선 파이프라인과 동일한 GitHub API 커밋 경로를 쓴다.

function slugify(text: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .slice(0, 60)
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "item";
}

/**
 * Next.js/Vercel 경로(예: 대장이 /hq/blog-jobs에서 발행 버튼 클릭)에서 brain/raw/external/에
 * 결과 요약을 커밋한다. 실패해도 호출부의 주 작업(발행 상태 갱신 등)을 막지 않도록 항상
 * 호출부에서 .catch()로 감싸 쓴다 — 지식 캡처는 부가 효과다.
 */
export async function appendToRaw(
  category: "video" | "blog",
  content: string,
  slugHint: string,
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(slugHint);
  const path = `brain/raw/external/${category}-${date}-${slug}-${Date.now()}.md`;
  const body = `---\ndate: "${new Date().toISOString()}"\ncategory: ${category}\n---\n\n${content.trim()}\n`;
  await writeGithubFile(path, body, `brain: ${category} 팩토리 결과 적재 (${slug})`);
}
