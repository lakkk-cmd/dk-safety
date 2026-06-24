import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { requireAgentSupabase } from "@/lib/agent-db";
import { chunkTextWithOverlap, embedAndSaveChunks } from "@/lib/knowledge-pdf-pipeline";
import { downloadKnowledgePdf } from "@/lib/knowledge-pdf-storage";
import { pgGetKnowledgePdf, pgUpdateKnowledgePdf } from "@/lib/knowledge-pdfs";
import { loadPDFParse } from "@/lib/pdf-parse-loader";

export const maxDuration = 300;

// 청크가 많은 대형 PDF는 한 번의 호출로 못 끝낼 수 있다 — maxDuration 안에서 깨끗하게 응답할
// 여유를 두고, 다 못 끝내면 done:false를 돌려줘 클라이언트가 이어서 다시 호출하게 한다.
const TIME_BUDGET_MS = 270_000;

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

    // 직전 호출이 시간 예산을 넘겨 중단됐다면 이미 저장된 청크 수만큼 이어서 처리한다.
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
      throw new Error("지식베이스 저장에 모두 실패했습니다.");
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
    const message = error instanceof Error ? error.message : "처리에 실패했습니다.";
    await pgUpdateKnowledgePdf(id, { status: "failed", errorMessage: message }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 500 });
  }
}
