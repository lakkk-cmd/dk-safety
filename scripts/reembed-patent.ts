#!/usr/bin/env node
/** knowledge_base의 patch4_basic(특허 정보) 행 하나만 텍스트에 맞게 임베딩을 재생성한다.
 *  seed-knowledge-base.ts 전체 재시드(테이블 전체 삭제)는 다른 992개 행(KEC 규정,
 *  업로드된 PDF 지식베이스, brain/wiki 등)까지 지워버려 쓰지 않는다 — 이 행 하나만 targeted UPDATE.
 *  사용: npx tsx --env-file=.env.local scripts/reembed-patent.ts */
import { createClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, ""),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

const TITLE = "특허 출원 기본 정보 (출원번호, 발명 개요)";
const CONTENT = `출원번호 10-2026-0082817, 심사청구 완료
발명: URL 파라미터 기반 멀티테넌트 유지보수 서비스 플랫폼
총 14개 청구항.`;

async function main() {
  const embedding = await embedText(`${TITLE}\n${CONTENT}`);
  const { data, error } = await supabase
    .from("knowledge_base")
    .update({ content: CONTENT, embedding })
    .eq("source", "patch4_basic")
    .select("id, source, content");

  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log("재임베딩 완료:", JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
