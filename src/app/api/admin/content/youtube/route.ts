import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { approveYoutubeQueueItem, rejectYoutubeQueueItem } from "@/lib/content-pipeline";

// 영상 파일 업로드(유튜브 업로드 API 호출)에 시간이 걸릴 수 있어 여유를 둠
export const maxDuration = 300;

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const id = String(form.get("id") ?? "");
      const action = String(form.get("action") ?? "");
      if (!id || (action !== "approve" && action !== "reject")) {
        return NextResponse.json({ message: "id, action(approve|reject) 파라미터 필요" }, { status: 400 });
      }

      if (action === "reject") {
        await rejectYoutubeQueueItem(id, String(form.get("reason") ?? ""));
        return NextResponse.json({ message: "반려되었습니다." });
      }

      const file = form.get("video");
      if (file instanceof File && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await approveYoutubeQueueItem(id, { buffer, mimeType: file.type || "video/mp4" });
        return NextResponse.json({
          message:
            result.status === "uploaded"
              ? `유튜브에 업로드되었습니다. (video id: ${result.videoId})`
              : "승인되었습니다.",
          result,
        });
      }

      const result = await approveYoutubeQueueItem(id);
      return NextResponse.json({ message: "승인되었습니다. 영상 파일 업로드 시 자동으로 유튜브에 업로드됩니다.", result });
    }

    const body = (await request.json()) as { id?: string; action?: "approve" | "reject"; reason?: string };
    if (!body.id || (body.action !== "approve" && body.action !== "reject")) {
      return NextResponse.json({ message: "id, action(approve|reject) 파라미터 필요" }, { status: 400 });
    }

    if (body.action === "reject") {
      await rejectYoutubeQueueItem(body.id, body.reason ?? "");
      return NextResponse.json({ message: "반려되었습니다." });
    }

    const result = await approveYoutubeQueueItem(body.id);
    return NextResponse.json({ message: "승인되었습니다. 영상 파일 업로드 시 자동으로 유튜브에 업로드됩니다.", result });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "처리 실패" },
      { status: 500 },
    );
  }
}
