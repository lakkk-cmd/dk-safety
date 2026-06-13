import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { approveBlogPost, deleteBlogPost, rejectBlogPost } from "@/lib/blog-store";

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  const body = (await request.json()) as { id?: string; action?: "approve" | "reject"; reason?: string };
  if (!body.id || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json({ message: "id, action(approve|reject) 파라미터 필요" }, { status: 400 });
  }

  try {
    if (body.action === "approve") {
      await approveBlogPost(body.id);
      return NextResponse.json({ message: "dkansim.com/blog에 발행되었습니다." });
    }

    await rejectBlogPost(body.id, body.reason ?? "");
    return NextResponse.json({ message: "반려되었습니다." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "처리 실패" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "id 파라미터 필요" }, { status: 400 });

  try {
    await deleteBlogPost(id);
    return NextResponse.json({ message: "삭제되었습니다." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "삭제 실패" },
      { status: 500 },
    );
  }
}
