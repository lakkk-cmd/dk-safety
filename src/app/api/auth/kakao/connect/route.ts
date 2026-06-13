import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getKakaoAuthUrl, KAKAO_OAUTH_ENABLED } from "@/lib/kakao-oauth";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!KAKAO_OAUTH_ENABLED) {
    return NextResponse.json({ message: "KAKAO_REST_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }
  return NextResponse.redirect(getKakaoAuthUrl());
}
