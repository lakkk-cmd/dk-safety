import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getYoutubeAuthUrl, YOUTUBE_OAUTH_ENABLED } from "@/lib/youtube-upload";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!YOUTUBE_OAUTH_ENABLED) {
    return NextResponse.json(
      { message: "YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET이 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  return NextResponse.redirect(getYoutubeAuthUrl());
}
