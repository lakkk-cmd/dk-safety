import { NextRequest, NextResponse } from "next/server";
import {
  validateContent,
  validateKnowledgeChunk,
  validateRAGAnswer,
  validateChunkRelevance,
  validateExpense,
  validateInvoice,
  validateConsultation,
  validateWorkerAssignment,
  validateAgentAnswer,
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
          body as { title: string; content: string; contentType: "blog" | "kakao" | "youtube" | "document"; keywords?: string[] }
        );
        break;
      case "rag_answer":
        result = await validateRAGAnswer(
          body as { question: string; answer: string; chunks: { content: string; source_file?: string }[] }
        );
        break;
      case "chunk_relevance":
        result = await validateChunkRelevance(
          body as { question: string; chunkContent: string; sourceFile?: string }
        );
        break;
      case "knowledge_chunk":
        result = await validateKnowledgeChunk(
          body as { sourceFile: string; content: string; category: string }
        );
        break;
      case "expense":
        result = await validateExpense(
          body as { category: string; amount: number; description?: string | null; paymentMethod: string; expenseDate: string }
        );
        break;
      case "invoice":
        result = await validateInvoice(
          body as {
            type: string;
            customerName: string;
            items: { description: string; qty: number; unit_price: number; amount: number }[];
            subtotal: number;
            tax: number;
            total: number;
          }
        );
        break;
      case "consultation":
        result = await validateConsultation(
          body as { customerName: string; customerPhone: string; channel: string; content: string; nextContactAt?: string | null }
        );
        break;
      case "worker_assignment":
        result = await validateWorkerAssignment(
          body as {
            workerId: string;
            workerName: string;
            reservationId: string;
            scheduledAt: string;
            existingAssignments: { scheduledAt: string; customerName: string }[];
          }
        );
        break;
      case "agent_answer":
        result = await validateAgentAnswer(
          body as { question: string; answer: string; context?: string; hasRAGEvidence?: boolean; includeProjectContext?: boolean }
        );
        break;
      default:
        return NextResponse.json({ error: `알 수 없는 type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...(result as object) });
  } catch (err) {
    console.error("[/api/validate]", err);
    const msg = (err as Error).message ?? "";
    if (msg.includes("429") || msg.includes("503") || msg.includes("prepayment") || msg.includes("quota") || msg.includes("overloaded")) {
      return NextResponse.json({ error: "GEMINI_UNAVAILABLE: " + msg }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
