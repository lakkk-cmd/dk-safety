/** Android PWA Web Share Target — 카카오톡/메일 등 공유 시트에서 받은 PDF를 지식베이스 파이프라인에 바로 태운다 */

import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { runClassifyStepOrFail, runProcessStepOrFail } from "@/lib/knowledge-pdf-pipeline";
import { ensureKnowledgeBucket, uploadKnowledgePdf } from "@/lib/knowledge-pdf-storage";
import { pgCreateKnowledgePdf } from "@/lib/knowledge-pdfs";

export const maxDuration = 60;

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const knowledgeUrl = new URL("/admin/knowledge", request.url);

  if (!(await isAdminAuthenticated())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 303);
  }

  const formData = await request.formData();
  const file = formData.get("pdf");
  if (!(file instanceof File) || file.size === 0) {
    knowledgeUrl.searchParams.set("shareError", "공유된 PDF 파일을 찾을 수 없습니다.");
    return NextResponse.redirect(knowledgeUrl, 303);
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    knowledgeUrl.searchParams.set("shareError", "PDF 파일만 공유할 수 있습니다.");
    return NextResponse.redirect(knowledgeUrl, 303);
  }
  if (file.size > MAX_SIZE_BYTES) {
    knowledgeUrl.searchParams.set("shareError", "파일이 너무 큽니다 (최대 50MB)");
    return NextResponse.redirect(knowledgeUrl, 303);
  }

  try {
    await ensureKnowledgeBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    const objectPath = `temp/${crypto.randomUUID()}-${file.name}`;
    await uploadKnowledgePdf(objectPath, buffer);
    const record = await pgCreateKnowledgePdf({ fileName: file.name, filePath: objectPath });

    await runClassifyStepOrFail(record.id);
    await runProcessStepOrFail(record.id);

    knowledgeUrl.searchParams.set("shared", file.name);
  } catch (error) {
    const message = error instanceof Error ? error.message : "공유된 PDF 처리에 실패했습니다.";
    knowledgeUrl.searchParams.set("shareError", message);
  }

  return NextResponse.redirect(knowledgeUrl, 303);
}
