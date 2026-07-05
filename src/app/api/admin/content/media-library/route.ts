import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { addMediaLibraryEntry, deleteMediaLibraryEntry, listMediaLibrary, type MediaType } from "@/lib/media-library";
import { uploadBinaryObject } from "@/lib/supabase-server";

const VIDEO_BUCKET = process.env.SUPABASE_VIDEO_BUCKET?.trim() || "dk-safety-video-assets";
const EXT_BY_TYPE: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav" };

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const items = await listMediaLibrary();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}

/** 파일 직접 업로드(FormData) 또는 기존 URL 등록(JSON, 현장사진 선택용) 둘 다 처리 */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const mediaType = form.get("mediaType") as MediaType | null;
      const tag = (form.get("tag") as string | null)?.trim();

      if (!(file instanceof File)) return NextResponse.json({ message: "file이 필요합니다." }, { status: 400 });
      if (mediaType !== "photo" && mediaType !== "music") {
        return NextResponse.json({ message: "mediaType은 photo 또는 music이어야 합니다." }, { status: 400 });
      }
      if (!tag) return NextResponse.json({ message: "tag가 필요합니다." }, { status: 400 });

      const buffer = Buffer.from(await file.arrayBuffer());
      const ct = file.type || "application/octet-stream";
      const ext = EXT_BY_TYPE[ct] ?? (mediaType === "music" ? "mp3" : "png");
      const url = await uploadBinaryObject({
        bucket: VIDEO_BUCKET,
        objectPath: `library/${mediaType}/${Date.now()}-${crypto.randomUUID()}.${ext}`,
        contentType: ct,
        data: buffer,
      });

      const item = await addMediaLibraryEntry({ mediaType, tag, url, source: "upload" });
      return NextResponse.json({ item });
    }

    const body = (await request.json()) as { mediaType?: MediaType; tag?: string; url?: string; source?: "upload" | "field_report" };
    const mediaType = body.mediaType;
    const tag = body.tag?.trim();
    const url = body.url?.trim();
    if (mediaType !== "photo" && mediaType !== "music") {
      return NextResponse.json({ message: "mediaType은 photo 또는 music이어야 합니다." }, { status: 400 });
    }
    if (!tag || !url) return NextResponse.json({ message: "tag, url이 필요합니다." }, { status: 400 });

    const item = await addMediaLibraryEntry({ mediaType, tag, url, source: body.source ?? "field_report" });
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "등록 실패" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ message: "id 파라미터가 필요합니다." }, { status: 400 });
    await deleteMediaLibraryEntry(id);
    return NextResponse.json({ message: "삭제 완료" });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "삭제 실패" }, { status: 500 });
  }
}
