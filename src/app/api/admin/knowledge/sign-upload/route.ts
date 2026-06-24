/** 1단계 — Supabase Storage 서명 업로드 URL 발급. 실제 PDF 바이트는 클라이언트가 이 URL로
 *  직접 PUT하므로 Vercel 함수 본문 크기 제한(4.5MB)에 걸리지 않는다. */

import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createKnowledgeUploadSignedUrl, ensureKnowledgeBucket, safeStorageFileName } from "@/lib/knowledge-pdf-storage";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { fileName?: string } | null;
  const fileName = body?.fileName?.trim();
  if (!fileName) {
    return NextResponse.json({ message: "fileName이 필요합니다." }, { status: 400 });
  }
  if (!fileName.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ message: "PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  try {
    await ensureKnowledgeBucket();
    const objectPath = `temp/${crypto.randomUUID()}-${safeStorageFileName(fileName)}`;
    const signedUrl = await createKnowledgeUploadSignedUrl(objectPath);
    return NextResponse.json({ path: objectPath, signedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "업로드 URL 생성에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
