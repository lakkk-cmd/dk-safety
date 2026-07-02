import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getProjectContext, refreshProjectContext } from "@/lib/project-context";

export const dynamic = "force-dynamic";

// GET: 현재 컨텍스트 조회 (캐시 우선)
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }
  try {
    const context = await getProjectContext();
    return NextResponse.json({ context });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST: project_features 현재 상태로 컨텍스트 캐시 강제 갱신
export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }
  try {
    const context = await refreshProjectContext();
    return NextResponse.json({ success: true, context });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
