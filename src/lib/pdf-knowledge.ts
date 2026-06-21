/** PDF 첨부 자동 학습 — 텍스트 추출 → 청크 분할 → 임베딩 → knowledge_base 저장 */

import { PDFParse } from "pdf-parse";
import { embedText } from "@/lib/embeddings";
import { requireAgentSupabase } from "@/lib/agent-db";

const CHUNK_SIZE = 700;

function chunkText(text: string, size = CHUNK_SIZE): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = "";

  for (const p of paragraphs) {
    const candidate = buf ? `${buf}\n\n${p}` : p;
    if (candidate.length > size && buf) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = candidate;
    }
    while (buf.length > size * 1.5) {
      chunks.push(buf.slice(0, size));
      buf = buf.slice(size);
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export type PdfIngestResult = { chunksSaved: number; error?: string };

/** PDF 버퍼를 텍스트로 추출해 knowledge_base에 청크별로 저장한다. 실패해도 throw하지 않고 결과로 보고한다. */
export async function ingestPdfToKnowledgeBase(fileName: string, buffer: Buffer): Promise<PdfIngestResult> {
  let text: string;
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    text = result.text;
  } catch (err) {
    return { chunksSaved: 0, error: `PDF 텍스트 추출 실패: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    await parser.destroy();
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) return { chunksSaved: 0, error: "PDF에서 추출된 텍스트가 없습니다." };

  const supabase = requireAgentSupabase();
  let saved = 0;
  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];
    try {
      const embedding = await embedText(content);
      const { error } = await supabase.from("knowledge_base").insert({
        source: fileName,
        title: `${fileName} (${i + 1}/${chunks.length})`,
        content,
        embedding,
        category: "internal",
        is_external: false,
      });
      if (!error) saved += 1;
    } catch {
      // 청크 1개 실패는 건너뛰고 나머지는 계속 저장
    }
  }

  if (saved === 0) return { chunksSaved: 0, error: "지식베이스 저장에 모두 실패했습니다." };
  return { chunksSaved: saved };
}
