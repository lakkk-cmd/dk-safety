import { NextResponse } from "next/server";
import crypto from "crypto";
import { notifyVercelDeployment } from "@/lib/kakao-publish";
import { logAgentEvent } from "@/lib/pipeline-logs";

export const runtime = "nodejs";

type VercelWebhookPayload = {
  type: string;
  payload?: {
    target?: string | null;
    deployment?: {
      name?: string;
      url?: string;
      meta?: { githubCommitSha?: string; githubCommitMessage?: string };
    };
    links?: { deployment?: string };
  };
};

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha1", secret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(request: Request) {
  const secret = process.env.VERCEL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "VERCEL_WEBHOOK_SECRET 미설정" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-vercel-signature");
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "서명 검증 실패" }, { status: 403 });
  }

  const body = JSON.parse(rawBody) as VercelWebhookPayload;
  const target = body.payload?.target ?? null;
  const deployment = body.payload?.deployment;

  // 프로덕션 배포만 알림 — 프리뷰 배포마다 알림 오면 스팸이 됨
  if (target !== "production" || !deployment) {
    return NextResponse.json({ skipped: true, reason: "not production" });
  }

  try {
    if (body.type === "deployment.succeeded") {
      await notifyVercelDeployment({
        status: "succeeded",
        projectName: deployment.name ?? "dk-safety",
        deploymentUrl: deployment.url ?? "dkansim.com",
        commitSha: deployment.meta?.githubCommitSha,
        commitMessage: deployment.meta?.githubCommitMessage,
      });
      await logAgentEvent("info", "vercel-webhook", "프로덕션 배포 완료 알림 발송", { deploymentUrl: deployment.url });
    } else if (body.type === "deployment.error") {
      await notifyVercelDeployment({
        status: "error",
        projectName: deployment.name ?? "dk-safety",
        deploymentUrl: deployment.url ?? "dkansim.com",
        commitSha: deployment.meta?.githubCommitSha,
        commitMessage: deployment.meta?.githubCommitMessage,
        inspectorUrl: body.payload?.links?.deployment,
      });
      await logAgentEvent("warn", "vercel-webhook", "프로덕션 배포 실패 알림 발송", { deploymentUrl: deployment.url });
    } else {
      return NextResponse.json({ skipped: true, reason: `unhandled type: ${body.type}` });
    }
  } catch (err) {
    console.error("[vercel-deploy webhook] 카카오 알림 발송 실패:", err);
    await logAgentEvent("error", "vercel-webhook", "카카오 알림 발송 실패", {
      error: err instanceof Error ? err.message : String(err),
    });
    // 카카오 발송 실패로 Vercel에 재시도시키지 않도록 200으로 응답
  }

  return NextResponse.json({ success: true });
}
