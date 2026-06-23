import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgFindKnowledgePdfByFileName } from "@/lib/knowledge-pdfs";

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
    const existing = await pgFindKnowledgePdfByFileName(fileName);
    return NextResponse.json({ duplicate: existing });
  } catch (error) {
    const message = error instanceof Error ? error.message : "중복 확인에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
