import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { classifyPdfCategory } from "@/lib/knowledge-pdf-pipeline";
import { downloadKnowledgePdf, moveKnowledgePdf } from "@/lib/knowledge-pdf-storage";
import { pgGetKnowledgePdf, pgUpdateKnowledgePdf } from "@/lib/knowledge-pdfs";
import { loadPDFParse } from "@/lib/pdf-parse-loader";

export const maxDuration = 60;

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

    const updated = await pgUpdateKnowledgePdf(id, {
      filePath: newPath,
      category: classification.category,
      autoCategory: classification.category,
      categoryReason: classification.reason,
      confidence: classification.confidence,
      status: "processing"
    });

    return NextResponse.json({ pdf: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "분류에 실패했습니다.";
    await pgUpdateKnowledgePdf(id, { status: "failed", errorMessage: message }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 500 });
  }
}
