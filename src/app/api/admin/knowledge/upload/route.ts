import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ensureKnowledgeBucket, uploadKnowledgePdf } from "@/lib/knowledge-pdf-storage";
import {
  pgCreateKnowledgePdf,
  pgDeleteKnowledgeChunksForPdf,
  pgDeleteKnowledgePdfRecord
} from "@/lib/knowledge-pdfs";

export const maxDuration = 60;

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ message: "multipart 요청이 필요합니다." }, { status: 400 });
  }
  const formData = await request.formData();
  const file = formData.get("file");
  const replaceId = formData.get("replaceId");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ message: "PDF 파일이 필요합니다." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ message: "PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ message: "파일이 너무 큽니다 (최대 50MB)" }, { status: 400 });
  }

  try {
    await ensureKnowledgeBucket();

    if (typeof replaceId === "string" && replaceId) {
      await pgDeleteKnowledgeChunksForPdf(replaceId);
      await pgDeleteKnowledgePdfRecord(replaceId);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const objectPath = `temp/${crypto.randomUUID()}-${file.name}`;
    await uploadKnowledgePdf(objectPath, buffer);

    const record = await pgCreateKnowledgePdf({ fileName: file.name, filePath: objectPath });
    return NextResponse.json({ pdf: record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "업로드에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
