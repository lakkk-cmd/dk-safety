import { NextRequest, NextResponse } from "next/server";
import { reviewCode } from "@/lib/code-review";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      files?: { path: string; content: string }[];
      context?: string;
      commit?: string;
    };

    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      return NextResponse.json({ error: "files 배열이 필요합니다." }, { status: 400 });
    }

    const result = await reviewCode({
      files: body.files,
      context: body.context,
      commit: body.commit,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[/api/code-review] 오류:", err);
    const msg = (err as Error).message;
    if (msg.includes("429") || msg.includes("503") || msg.includes("quota") || msg.includes("overloaded")) {
      return NextResponse.json({ error: "GEMINI_UNAVAILABLE: " + msg }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
