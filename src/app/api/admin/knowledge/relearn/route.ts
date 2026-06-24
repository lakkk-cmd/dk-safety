import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireAgentSupabase } from "@/lib/agent-db";
import { embedText } from "@/lib/embeddings";
import { chunkTextWithOverlap } from "@/lib/knowledge-pdf-pipeline";
import { downloadKnowledgePdf } from "@/lib/knowledge-pdf-storage";
import { pgDeleteKnowledgeChunksForPdf, pgGetKnowledgePdf, pgUpdateKnowledgePdf } from "@/lib/knowledge-pdfs";
import { loadPDFParse } from "@/lib/pdf-parse-loader";

export const maxDuration = 120;

/** 기존 청크만 삭제 후 같은 원본 PDF·카테고리로 재청킹·재임베딩 (재분류는 하지 않음) */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id?.trim();
  if (!id) {
    return NextResponse.json({ message: "id가 필요합니다." }, { status: 400 });
  }

  try {
    const record = await pgGetKnowledgePdf(id);
    if (!record) {
      return NextResponse.json({ message: "PDF 레코드를 찾을 수 없습니다." }, { status: 404 });
    }

    await pgUpdateKnowledgePdf(id, { status: "processing", errorMessage: null });
    await pgDeleteKnowledgeChunksForPdf(id);

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
    let saved = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await embedText(chunks[i]);
        const { error } = await supabase.from("knowledge_base").insert({
          source: record.fileName,
          title: `${record.fileName} (${i + 1}/${chunks.length})`,
          content: chunks[i],
          embedding,
          category: record.category,
          is_external: false,
          pdf_id: id
        });
        if (!error) saved += 1;
      } catch {
        // 청크 1개 실패는 건너뛰고 나머지는 계속 저장
      }
    }

    if (saved === 0) {
      throw new Error("재학습 저장에 모두 실패했습니다.");
    }

    const updated = await pgUpdateKnowledgePdf(id, {
      status: "completed",
      chunkCount: saved,
      pageCount,
      processedAt: new Date().toISOString(),
      errorMessage: null
    });

    return NextResponse.json({ pdf: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "재학습에 실패했습니다.";
    await pgUpdateKnowledgePdf(id, { status: "failed", errorMessage: message }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 500 });
  }
}
