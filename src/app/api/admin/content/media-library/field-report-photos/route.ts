import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgListRecentFieldReportPhotos } from "@/lib/field-reports";

/** 관리자가 재업로드 없이 기존 현장 점검 사진을 골라 미디어 보관함에 태그로 등록할 수 있도록 목록 제공 */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  try {
    const photos = await pgListRecentFieldReportPhotos(60);
    return NextResponse.json({ photos });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}
