import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// worker/는 로컬 PC에서 이 repo를 checkout한 채로 실행되므로, brain/raw/에 직접 파일을
// 써도 된다(Vercel 서버리스와 달리 파일시스템이 영구적). worker/lib/ -> worker/ -> repo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RAW_DIR = path.join(REPO_ROOT, "brain", "raw", "external");

function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .slice(0, 60)
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

/**
 * 영상/블로그 팩토리 워커가 작업을 published/error로 종료할 때 결과 요약을
 * brain/raw/external/에 마크다운으로 적재한다. 실패해도 본 작업 흐름을 막지 않는다
 * (지식 캡처는 부가 효과이지 워커의 핵심 책임이 아님).
 */
export function appendToRaw(category, content, slugHint) {
  try {
    mkdirSync(RAW_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const slug = slugify(slugHint);
    const filePath = path.join(RAW_DIR, `${category}-${date}-${slug}-${Date.now()}.md`);
    const body = `---\ndate: "${new Date().toISOString()}"\ncategory: ${category}\n---\n\n${String(content).trim()}\n`;
    writeFileSync(filePath, body, "utf-8");
  } catch (e) {
    console.error("[append-to-raw] 기록 실패:", e?.message ?? e);
  }
}
