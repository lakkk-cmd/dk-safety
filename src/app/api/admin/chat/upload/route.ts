import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { uploadBinaryObject } from "@/lib/supabase-server";

const CHAT_BUCKET = process.env.SUPABASE_CHAT_UPLOAD_BUCKET ?? "chat-uploads";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "파일이 없습니다." }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ message: "파일 크기는 20MB 이하여야 합니다." }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const objectPath = `chat/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const data = new Uint8Array(await file.arrayBuffer());

    const url = await uploadBinaryObject({
      bucket: CHAT_BUCKET,
      objectPath,
      contentType: file.type || "application/octet-stream",
      data,
    });

    return NextResponse.json({ url, mediaType: file.type });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "업로드 실패" },
      { status: 500 },
    );
  }
}
