/** PDF 첨부 자동 학습 — 텍스트 추출 → 청크 분할 → knowledge 테이블 저장(듀얼 임베딩) */

import { PDFParse } from "pdf-parse";
import { saveKnowledgeRows } from "@/lib/knowledge-store";

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

/** PDF 버퍼를 텍스트로 추출해 knowledge 테이블에 청크별로 저장한다. 실패해도 throw하지 않고 결과로 보고한다. */
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

  const BATCH_SIZE = 20;
  let saved = 0;
  let lastError: string | undefined;
  for (let cursor = 0; cursor < chunks.length; cursor += BATCH_SIZE) {
    const batch = chunks.slice(cursor, cursor + BATCH_SIZE);
    try {
      const result = await saveKnowledgeRows(
        batch.map((content, i) => ({
          source: fileName,
          title: `${fileName} (${cursor + i + 1}/${chunks.length})`,
          content,
          category: "internal",
          chunkIndex: cursor + i,
          isExternal: false,
        })),
      );
      saved += result.saved;
      if (result.saved === 0) lastError = result.openRouterError ?? result.voyageError ?? undefined;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "지식베이스 저장 실패";
    }
  }

  if (saved === 0) return { chunksSaved: 0, error: lastError ?? "지식베이스 저장에 모두 실패했습니다." };
  return { chunksSaved: saved };
}
