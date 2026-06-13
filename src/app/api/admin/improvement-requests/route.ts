import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import {
  acknowledgeAllImprovementRequests,
  analyzeAndFileImprovementRequest,
  countUnacknowledgedImprovementRequests,
  createImprovementRequest,
  listImprovementRequests,
  type ImprovementRequestType,
} from "@/lib/improvement-requests";
import { saveImageFiles } from "@/lib/upload-store";

export const maxDuration = 120;

const VALID_TYPES: ImprovementRequestType[] = ["feature", "bug", "ui", "other"];

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const [items, unacknowledged] = await Promise.all([
      listImprovementRequests(),
      countUnacknowledgedImprovementRequests(),
    ]);
    return NextResponse.json({ items, unacknowledged });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    let type = "other";
    let content = "";
    let screenshotUrl: string | null = null;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      type = String(formData.get("type") ?? "other");
      content = String(formData.get("content") ?? "").trim();
      const file = formData.get("screenshot");
      if (file instanceof File && file.size > 0 && file.type.startsWith("image/")) {
        const urls = await saveImageFiles([file], "improvements");
        screenshotUrl = urls[0] ?? null;
      }
    } else {
      const body = (await request.json()) as { type?: string; content?: string };
      type = body.type ?? "other";
      content = (body.content ?? "").trim();
    }

    if (!content) {
      return NextResponse.json({ message: "요청 내용을 입력해주세요." }, { status: 400 });
    }
    if (!VALID_TYPES.includes(type as ImprovementRequestType)) {
      type = "other";
    }

    const created = await createImprovementRequest({
      type: type as ImprovementRequestType,
      content,
      screenshotUrl,
    });

    try {
      const analyzed = await analyzeAndFileImprovementRequest(created.id);
      return NextResponse.json({ item: analyzed });
    } catch (analyzeError) {
      return NextResponse.json({
        item: {
          ...created,
          status: "failed",
          error_message: analyzeError instanceof Error ? analyzeError.message : "분석 실패",
        },
        message: "요청은 저장되었지만 자동 분석/이슈 생성에 실패했습니다.",
      });
    }
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "요청 처리 실패" }, { status: 500 });
  }
}

export async function PATCH() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    await acknowledgeAllImprovementRequests();
    return NextResponse.json({ message: "확인되었습니다." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "처리 실패" }, { status: 500 });
  }
}
