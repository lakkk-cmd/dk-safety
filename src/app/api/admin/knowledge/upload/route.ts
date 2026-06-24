import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  pgCreateKnowledgePdf,
  pgDeleteKnowledgeChunksForPdf,
  pgDeleteKnowledgePdfRecord
} from "@/lib/knowledge-pdfs";

/** 2단계 — PDF 바이트는 이미 /api/admin/knowledge/sign-upload로 받은 서명 URL을 통해
 *  클라이언트가 Supabase Storage에 직접 PUT을 마쳤다. 여기서는 그 결과(path)를
 *  knowledge_pdfs 레코드로 등록만 한다(요청 본문이 작아 함수 본문 크기 제한과 무관). */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as
    | { fileName?: string; path?: string; replaceId?: string }
    | null;
  const fileName = body?.fileName?.trim();
  const path = body?.path?.trim();
  const replaceId = body?.replaceId?.trim();
  if (!fileName || !path) {
    return NextResponse.json({ message: "fileName/path가 필요합니다." }, { status: 400 });
  }
  if (!fileName.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ message: "PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  try {
    if (replaceId) {
      await pgDeleteKnowledgeChunksForPdf(replaceId);
      await pgDeleteKnowledgePdfRecord(replaceId);
    }

    const record = await pgCreateKnowledgePdf({ fileName, filePath: path });
    return NextResponse.json({ pdf: record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "업로드에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
