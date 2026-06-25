/** /admin/knowledge — PDF 카테고리 자동분류(Haiku) + 청크 분할(중복 오버랩) + 단계 실행 함수 */

import { callClaudeWithTools, extractJsonBlock, type ClaudeContentBlock } from "@/lib/agents";
import { requireAgentSupabase } from "@/lib/agent-db";
import { embedTexts } from "@/lib/embeddings";
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategoryKey } from "@/lib/knowledge-categories";
import { downloadKnowledgePdf, moveKnowledgePdf } from "@/lib/knowledge-pdf-storage";
import { pgGetKnowledgePdf, pgUpdateKnowledgePdf, type KnowledgePdf } from "@/lib/knowledge-pdfs";
import { loadPDFParse } from "@/lib/pdf-parse-loader";

const CATEGORY_KEYS = KNOWLEDGE_CATEGORIES.map((c) => c.key);

const CLASSIFY_SYSTEM_PROMPT = `PDF 내용을 읽고 아래 카테고리 중 하나로 분류하세요. JSON만 반환하세요.
카테고리:
- regulation: 전기 법령, 규정, KEC, 안전기준
- technical: 전기 기술, 장비, 시공, 매뉴얼
- content_youtube: 유튜브 영상 제작, 촬영, 편집
- content_blog: 블로그 글쓰기, SEO, 포스팅
- marketing: 마케팅, 광고, 홍보, 브랜딩
- ai_automation: AI 활용, 자동화, 프롬프트
- business: 사업계획, 경영, 회계, 전략
- general: 위에 해당 없음

응답 형식(다른 텍스트 없이 JSON만):
{"category": "regulation", "reason": "한국전기설비규정 관련 법령 문서", "confidence": 0.95}`;

const ROUTING_MODEL = process.env.ANTHROPIC_ROUTING_MODEL?.trim() || "claude-haiku-4-5";

function extractText(content: ClaudeContentBlock[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export type ClassifyResult = { category: KnowledgeCategoryKey; reason: string; confidence: number };

/** 첫 3페이지 정도의 텍스트만 넘겨 빠르고 저렴하게 분류 — 실패 시 general로 폴백(throw하지 않음) */
export async function classifyPdfCategory(excerptText: string): Promise<ClassifyResult> {
  try {
    const resp = await callClaudeWithTools({
      systemPrompt: CLASSIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: excerptText.slice(0, 6000) }],
      model: ROUTING_MODEL,
      maxTokens: 200,
      timeoutMs: 30_000
    });
    const text = extractText(resp.content);
    const json = extractJsonBlock(text);
    if (!json) throw new Error("분류 응답에서 JSON을 찾지 못했습니다.");
    const parsed = JSON.parse(json) as { category?: string; reason?: string; confidence?: number };
    const category = CATEGORY_KEYS.includes(parsed.category as KnowledgeCategoryKey)
      ? (parsed.category as KnowledgeCategoryKey)
      : "general";
    return {
      category,
      reason: typeof parsed.reason === "string" ? parsed.reason : "분류 근거 없음",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5
    };
  } catch (err) {
    console.warn("[knowledge-pdf-pipeline] 분류 실패, general로 폴백:", err instanceof Error ? err.message : err);
    return { category: "general", reason: "자동 분류 실패 — 일반으로 분류됨", confidence: 0 };
  }
}

const CHUNK_SIZE = 600;
const OVERLAP_RATIO = 0.15;

function lastSentence(text: string): string {
  const sentences = text.split(/(?<=[.!?다요][\s\n]|[.!?다요]$)/).filter((s) => s.trim().length > 0);
  return sentences.length > 0 ? sentences[sentences.length - 1].trim() : "";
}

/** 문단 단위로 자르고, 앞 청크의 마지막 1문장을 다음 청크 앞에 중복시켜 문맥을 잇는다 */
export function chunkTextWithOverlap(text: string, size = CHUNK_SIZE): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const rawChunks: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    const candidate = buf ? `${buf}\n\n${p}` : p;
    if (candidate.length > size && buf) {
      rawChunks.push(buf);
      buf = p;
    } else {
      buf = candidate;
    }
    while (buf.length > size * 1.5) {
      rawChunks.push(buf.slice(0, size));
      buf = buf.slice(size);
    }
  }
  if (buf) rawChunks.push(buf);

  if (rawChunks.length <= 1) return rawChunks;

  const overlapped: string[] = [rawChunks[0]];
  for (let i = 1; i < rawChunks.length; i++) {
    const prevTail = lastSentence(rawChunks[i - 1]).slice(0, Math.round(size * OVERLAP_RATIO));
    overlapped.push(prevTail ? `${prevTail}\n${rawChunks[i]}` : rawChunks[i]);
  }
  return overlapped;
}

/** Step 2 — 첫 3페이지 텍스트로 카테고리 분류, 원본을 해당 카테고리 폴더로 이동, status='processing'으로 갱신 */
export async function runClassifyStep(id: string): Promise<KnowledgePdf> {
  const record = await pgGetKnowledgePdf(id);
  if (!record) throw new Error("PDF 레코드를 찾을 수 없습니다.");

  const buffer = await downloadKnowledgePdf(record.filePath);
  const PDFParse = await loadPDFParse();
  const parser = new PDFParse({ data: buffer });
  let excerpt = "";
  try {
    const result = await parser.getText({ partial: [1, 2, 3] });
    excerpt = result.text;
  } finally {
    await parser.destroy();
  }

  const classification = await classifyPdfCategory(excerpt);
  const fileName = record.filePath.split("/").pop() ?? record.fileName;
  const newPath = `${classification.category}/${fileName}`;
  await moveKnowledgePdf(record.filePath, newPath);

  return pgUpdateKnowledgePdf(id, {
    filePath: newPath,
    category: classification.category,
    autoCategory: classification.category,
    categoryReason: classification.reason,
    confidence: classification.confidence,
    status: "processing"
  });
}

const EMBED_BATCH_SIZE = 20;

export type EmbedAndSaveResult = {
  saved: number;
  processedChunks: number;
  totalChunks: number;
  done: boolean;
  lastError: string | null;
};

/** 청크를 배치(기본 20개)로 묶어 한 번의 API 호출로 임베딩하고 한 번의 INSERT로 저장한다 —
 *  청크 하나마다 네트워크 왕복하던 것이 대형 PDF에서 시간 초과(FUNCTION_INVOCATION_TIMEOUT)의
 *  가장 큰 원인이었다. deadline을 넘기면 중간에 멈추고 done=false를 반환하므로 호출부가
 *  resumeFrom(이미 저장된 청크 수)으로 이어서 다시 호출할 수 있다. */
export async function embedAndSaveChunks(params: {
  pdfId: string;
  fileName: string;
  category: string | null;
  chunks: string[];
  resumeFrom: number;
  deadline: number;
}): Promise<EmbedAndSaveResult> {
  const { pdfId, fileName, category, chunks, resumeFrom, deadline } = params;
  const supabase = requireAgentSupabase();

  let saved = resumeFrom;
  let cursor = resumeFrom;
  let lastError: string | null = null;
  while (cursor < chunks.length) {
    if (Date.now() >= deadline) break;
    const batch = chunks.slice(cursor, cursor + EMBED_BATCH_SIZE);
    try {
      const embeddings = await embedTexts(batch);
      const rows = batch.map((content, i) => ({
        source: fileName,
        title: `${fileName} (${cursor + i + 1}/${chunks.length})`,
        content,
        embedding: embeddings[i],
        category,
        is_external: false,
        pdf_id: pdfId
      }));
      const { error } = await supabase.from("knowledge_base").insert(rows);
      if (error) lastError = error.message;
      else saved += rows.length;
    } catch (err) {
      // 배치 전체 실패는 건너뛰고 다음 배치로 계속 — 일부 청크 손실은 허용 가능한 트레이드오프.
      // 단, 모든 배치가 실패하면(saved===resumeFrom) 호출부가 진단할 수 있도록 마지막 에러는 보존한다.
      lastError = err instanceof Error ? err.message : "임베딩 배치 처리 중 알 수 없는 오류";
    }
    cursor += batch.length;
  }

  return { saved, processedChunks: cursor, totalChunks: chunks.length, done: cursor >= chunks.length, lastError };
}

/** Step 3 — 전체 텍스트 추출 → 청크 분할 → 임베딩 → knowledge_base 저장.
 *  deadline까지 다 못 끝내면 status='processing'으로 남겨 호출부(공유 시트는 단발성이라
 *  재시도는 "재학습" 버튼에 맡긴다)가 이어서 처리하거나 재학습할 수 있게 한다. */
export async function runProcessStep(id: string, options?: { deadline?: number }): Promise<KnowledgePdf> {
  const record = await pgGetKnowledgePdf(id);
  if (!record) throw new Error("PDF 레코드를 찾을 수 없습니다.");

  const buffer = await downloadKnowledgePdf(record.filePath);
  const PDFParse = await loadPDFParse();
  const parser = new PDFParse({ data: buffer });
  let text = "";
  let pageCount = 0;
  try {
    const result = await parser.getText();
    text = result.text;
    pageCount = result.total ?? 0;
  } finally {
    await parser.destroy();
  }

  const chunks = chunkTextWithOverlap(text);
  if (chunks.length === 0) throw new Error("PDF에서 추출된 텍스트가 없습니다.");

  const result = await embedAndSaveChunks({
    pdfId: id,
    fileName: record.fileName,
    category: record.category,
    chunks,
    resumeFrom: 0,
    deadline: options?.deadline ?? Date.now() + 50_000
  });
  if (result.saved === 0) throw new Error(result.lastError ?? "지식베이스 저장에 모두 실패했습니다.");

  return pgUpdateKnowledgePdf(id, {
    status: result.done ? "completed" : "processing",
    chunkCount: result.saved,
    pageCount,
    processedAt: result.done ? new Date().toISOString() : undefined,
    errorMessage: null
  });
}

/** 분류 실패 시 status='failed'+error_message 기록 후 재throw — 호출부에서 한 번만 catch하면 됨 */
export async function runClassifyStepOrFail(id: string): Promise<KnowledgePdf> {
  try {
    return await runClassifyStep(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "분류에 실패했습니다.";
    await pgUpdateKnowledgePdf(id, { status: "failed", errorMessage: message }).catch(() => undefined);
    throw err;
  }
}

export async function runProcessStepOrFail(id: string, options?: { deadline?: number }): Promise<KnowledgePdf> {
  try {
    return await runProcessStep(id, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : "처리에 실패했습니다.";
    await pgUpdateKnowledgePdf(id, { status: "failed", errorMessage: message }).catch(() => undefined);
    throw err;
  }
}
