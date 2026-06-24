import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireAgentSupabase } from "@/lib/agent-db";
import { chunkTextWithOverlap, embedAndSaveChunks } from "@/lib/knowledge-pdf-pipeline";
import { downloadKnowledgePdf } from "@/lib/knowledge-pdf-storage";
import { pgDeleteKnowledgeChunksForPdf, pgGetKnowledgePdf, pgUpdateKnowledgePdf } from "@/lib/knowledge-pdfs";
import { loadPDFParse } from "@/lib/pdf-parse-loader";

export const maxDuration = 300;

const TIME_BUDGET_MS = 270_000;

/** 기존 청크만 삭제 후 같은 원본 PDF·카테고리로 재청킹·재임베딩 (재분류는 하지 않음).
 *  대형 PDF는 한 번에 못 끝낼 수 있어 done:false를 돌려줄 수 있다 — 그 경우 reset 없이
 *  다시 호출하면(클라이언트가 자동으로 함) 이미 저장된 만큼은 유지하고 이어서 처리한다. */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { id?: string; reset?: boolean } | null;
  const id = body?.id?.trim();
  if (!id) {
    return NextResponse.json({ message: "id가 필요합니다." }, { status: 400 });
  }
  const reset = body?.reset !== false;

  try {
    const record = await pgGetKnowledgePdf(id);
    if (!record) {
      return NextResponse.json({ message: "PDF 레코드를 찾을 수 없습니다." }, { status: 404 });
    }

    if (reset) {
      await pgUpdateKnowledgePdf(id, { status: "processing", errorMessage: null });
      await pgDeleteKnowledgeChunksForPdf(id);
    }

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
    if (chunks.length === 0) {
      throw new Error("PDF에서 추출된 텍스트가 없습니다.");
    }

    const supabase = requireAgentSupabase();
    const { count } = await supabase
      .from("knowledge_base")
      .select("id", { count: "exact", head: true })
      .eq("pdf_id", id);
    const resumeFrom = count ?? 0;

    const result = await embedAndSaveChunks({
      pdfId: id,
      fileName: record.fileName,
      category: record.category,
      chunks,
      resumeFrom,
      deadline: Date.now() + TIME_BUDGET_MS
    });

    if (result.saved === 0) {
      throw new Error("재학습 저장에 모두 실패했습니다.");
    }

    const updated = await pgUpdateKnowledgePdf(id, {
      status: result.done ? "completed" : "processing",
      chunkCount: result.saved,
      pageCount,
      processedAt: result.done ? new Date().toISOString() : undefined,
      errorMessage: null
    });

    return NextResponse.json({
      pdf: updated,
      done: result.done,
      totalChunks: result.totalChunks,
      processedChunks: result.processedChunks
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "재학습에 실패했습니다.";
    await pgUpdateKnowledgePdf(id, { status: "failed", errorMessage: message }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 500 });
  }
}
