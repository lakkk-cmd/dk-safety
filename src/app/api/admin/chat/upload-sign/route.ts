import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createSignedUploadUrl } from "@/lib/supabase-server";

const CHAT_BUCKET = process.env.SUPABASE_CHAT_UPLOAD_BUCKET ?? "chat-uploads";

/** 1단계 — Supabase Storage 서명 업로드 URL 발급. 실제 파일 바이트는 클라이언트가 이 URL로
 *  직접 PUT하므로 Vercel 함수 본문 크기 제한(4.5MB)에 걸리지 않는다(knowledge-pdf 업로드와
 *  동일 패턴, 2026-09-06 채팅 첨부파일 업로드 실패 원인으로 발견돼 적용). */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { fileName?: string } | null;
  const fileName = body?.fileName?.trim();
  if (!fileName) {
    return NextResponse.json({ message: "fileName이 필요합니다." }, { status: 400 });
  }

  try {
    const ext = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const objectPath = `chat/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const signedUrl = await createSignedUploadUrl(CHAT_BUCKET, objectPath);
    return NextResponse.json({ path: objectPath, signedUrl });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "업로드 URL 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}
