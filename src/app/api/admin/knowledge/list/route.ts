import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgListKnowledgePdfs } from "@/lib/knowledge-pdfs";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  try {
    const pdfs = await pgListKnowledgePdfs();
    return NextResponse.json({ pdfs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "목록 조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
