import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgAppendTaskPhotos } from "@/lib/reservations-pg";
import { saveImageFiles } from "@/lib/upload-store";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ message: "multipart 요청이 필요합니다." }, { status: 400 });
  }
  const formData = await request.formData();
  const files = formData
    .getAll("photos")
    .filter((item): item is File => item instanceof File && item.size > 0 && item.type.startsWith("image/"))
    .slice(0, 5);
  if (files.length === 0) {
    return NextResponse.json({ message: "이미지 파일을 첨부해주세요." }, { status: 400 });
  }
  try {
    const urls = await saveImageFiles(files, "worker-tasks");
    const sitePhotoUrls = await pgAppendTaskPhotos(id, session.workerId, urls);
    return NextResponse.json({ sitePhotoUrls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "업로드에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
