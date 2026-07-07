import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { listBlogJobs, publishBlogJob, rejectBlogJob } from "@/lib/blog-jobs";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const items = await listBlogJobs();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const body = (await request.json()) as {
      id?: string;
      action?: string;
      published_url?: string;
      note?: string;
    };
    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ message: "id가 필요합니다." }, { status: 400 });
    }
    if (body.action === "publish") {
      const item = await publishBlogJob(body.id, String(body.published_url ?? ""));
      return NextResponse.json({ item });
    }
    if (body.action === "reject") {
      const item = await rejectBlogJob(body.id, String(body.note ?? ""));
      return NextResponse.json({ item });
    }
    return NextResponse.json({ message: "action은 publish 또는 reject여야 합니다." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "처리 실패" },
      { status: 400 }
    );
  }
}
