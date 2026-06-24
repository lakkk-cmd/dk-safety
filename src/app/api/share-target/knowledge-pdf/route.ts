/** Android PWA Web Share Target — 카카오톡/메일 등 공유 시트에서 받은 PDF를 지식베이스 파이프라인에 바로 태운다 */

import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { runClassifyStepOrFail, runProcessStepOrFail } from "@/lib/knowledge-pdf-pipeline";
import { ensureKnowledgeBucket, uploadKnowledgePdf } from "@/lib/knowledge-pdf-storage";
import { pgCreateKnowledgePdf } from "@/lib/knowledge-pdfs";

export const maxDuration = 60;

// 공유 시트는 브라우저가 직접 이 라우트로 POST하므로(JS로 가로챌 수 없음) 클라이언트의 50MB 업로드
// 흐름(서명 URL 직접 PUT)을 쓸 수 없다 — 그대로 Vercel 함수 본문 크기 제한(~4.5MB)에 걸린다.
// 그 한도를 넘으면 Vercel 플랫폼이 함수 진입 전에 끊어버려 이 검사 자체가 실행되지 않으므로,
// 안전하게 그 아래 값으로만 제한해 의미 있는 메시지를 줄 수 있는 범위에서 동작한다.
const MAX_SIZE_BYTES = 4 * 1024 * 1024;

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
    knowledgeUrl.searchParams.set("shareError", "공유로 보낼 수 있는 PDF는 최대 4MB입니다. 더 큰 파일은 앱에서 '내 파일에서 선택'으로 올려주세요.");
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
