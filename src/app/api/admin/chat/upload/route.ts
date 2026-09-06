import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ingestPdfToKnowledgeBase } from "@/lib/pdf-knowledge";
import { publicObjectUrl } from "@/lib/supabase-server";

const CHAT_BUCKET = process.env.SUPABASE_CHAT_UPLOAD_BUCKET ?? "chat-uploads";

export const maxDuration = 120;

/** 2단계 — 클라이언트가 /upload-sign에서 받은 서명 URL로 이미 Storage에 직접 PUT을 끝낸 뒤
 *  호출한다. 여기서는 파일 바이트를 다시 받지 않고(그러면 4.5MB 제한이 되살아남) path만 받아
 *  공개 URL을 계산하고, PDF면 이미 올라간 객체를 공개 URL로 내려받아 지식베이스 학습만 수행한다. */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    path?: string;
    fileName?: string;
    contentType?: string;
  } | null;
  const path = body?.path?.trim();
  const fileName = body?.fileName?.trim() ?? "file";
  if (!path) {
    return NextResponse.json({ message: "path가 필요합니다." }, { status: 400 });
  }

  try {
    const url = publicObjectUrl(CHAT_BUCKET, path);
    const contentType = body?.contentType ?? "application/octet-stream";

    let pdfLearning: { chunksSaved: number; error?: string } | undefined;
    if (contentType === "application/pdf") {
      const fileRes = await fetch(url);
      if (!fileRes.ok) {
        return NextResponse.json({ message: "업로드된 파일을 찾을 수 없습니다." }, { status: 404 });
      }
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      pdfLearning = await ingestPdfToKnowledgeBase(fileName, buffer);
    }

    return NextResponse.json({ url, mediaType: contentType, pdfLearning });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "처리 실패" },
      { status: 500 },
    );
  }
}
