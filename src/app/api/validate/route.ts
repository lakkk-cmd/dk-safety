import { NextRequest, NextResponse } from "next/server";
import {
  validateContent,
  validateKnowledgeChunk,
  validateRAGAnswer,
  GEMINI_ENABLED,
} from "@/lib/cross-validate";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }
  if (!GEMINI_ENABLED) {
    return NextResponse.json({ error: "GEMINI_API_KEY 미설정" }, { status: 503 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { type } = body as { type?: string };

    let result: unknown;

    switch (type) {
      case "content":
        result = await validateContent(
          body as { title: string; content: string; contentType: "blog" | "kakao" | "youtube"; keywords?: string[] }
        );
        break;
      case "rag_answer":
        result = await validateRAGAnswer(
          body as { question: string; answer: string; chunks: { content: string; source_file?: string }[] }
        );
        break;
      case "knowledge_chunk":
        result = await validateKnowledgeChunk(
          body as { sourceFile: string; content: string; category: string }
        );
        break;
      default:
        return NextResponse.json({ error: `알 수 없는 type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...(result as object) });
  } catch (err) {
    console.error("[/api/validate]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
