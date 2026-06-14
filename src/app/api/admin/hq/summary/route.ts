import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getHqSummary } from "@/lib/hq-summary";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }

  const summary = await getHqSummary();
  return NextResponse.json(summary);
}
