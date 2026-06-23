import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { deleteKnowledgePdf } from "@/lib/knowledge-pdf-storage";
import { pgDeleteKnowledgeChunksForPdf, pgDeleteKnowledgePdfRecord, pgGetKnowledgePdf } from "@/lib/knowledge-pdfs";

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
    await pgDeleteKnowledgeChunksForPdf(id);
    await pgDeleteKnowledgePdfRecord(id);
    await deleteKnowledgePdf(record.filePath).catch(() => undefined);
    return NextResponse.json({ message: "삭제되었습니다." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "삭제에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
