import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { readBackupFile } from "@/lib/reservations-store";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get("fileName")?.trim() ?? "";
  if (!fileName) {
    return NextResponse.json({ message: "다운로드할 파일명이 필요합니다." }, { status: 400 });
  }

  try {
    const raw = await readBackupFile(fileName);
    return new NextResponse(raw, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "파일 다운로드 중 오류가 발생했습니다." },
      { status: 400 }
    );
  }
}
