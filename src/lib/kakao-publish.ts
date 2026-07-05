import { requireAgentSupabase } from "@/lib/agent-db";
import { getKakaoAccessToken, KAKAO_OAUTH_ENABLED } from "@/lib/kakao-oauth";
import { sendKakaoFriendTalk } from "@/lib/solapi-agent";

const KAKAO_MEMO_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send";

export const KAKAO_MEMO_ENABLED = Boolean(process.env.KAKAO_ACCESS_TOKEN?.trim()) || KAKAO_OAUTH_ENABLED;

/**
 * 카카오톡 "나에게 보내기" API로 메모를 전송한다.
 * 카카오 채널 공개 발행 API는 비즈니스 인증이 필요해 제공되지 않으므로,
 * 대장이 알림을 받아 직접 채널에 발행/확인하는 흐름을 보조한다.
 */
async function sendKakaoMemo(text: string, linkUrl = "https://contents.dkansim.com"): Promise<void> {
  const token = await getKakaoAccessToken();

  const template = JSON.stringify({
    object_type: "text",
    text: text.slice(0, 200),
    link: { web_url: linkUrl, mobile_web_url: linkUrl },
  });

  const res = await fetch(KAKAO_MEMO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({ template_object: template }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`카카오 전송 실패: ${res.status} ${err.slice(0, 200)}`);
  }
}

/** 카카오 매니저 톡톡 — 포스트 발행 (대장에게 발행 알림 전송) */
export async function publishKakaoPost(title: string, content: string): Promise<void> {
  await sendKakaoMemo(`[카카오 채널 발행]\n${title}\n\n${content}`);
}

// ─── 기존 고객 친구톡 자동 발송 ────────────────────────────────────────────────
// ⚠️ 정보통신망법 제50조: 광고성 정보 전송은 (광고) 표시 + 수신거부 안내가 필수이며,
// 원칙적으로 사전동의가 필요하다. "기존 거래관계 고객" 예외 요건 충족 여부는 반드시
// 별도로 법률 확인이 필요하다 — 여기서는 최소한의 안전장치로 최근 6개월 이내 완료
// 거래 고객으로만 대상을 제한한다. 실수로 켜지는 걸 막기 위해 기본값은 꺼짐(false)이며
// KAKAO_FRIENDTALK_BROADCAST_ENABLED=true를 명시적으로 설정해야 실제 발송된다.
export const KAKAO_FRIENDTALK_BROADCAST_ENABLED = process.env.KAKAO_FRIENDTALK_BROADCAST_ENABLED === "true";

async function getRecentCustomerPhones(monthsBack = 6): Promise<string[]> {
  const supabase = requireAgentSupabase();
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  const { data, error } = await supabase
    .from("reservations")
    .select("phone")
    .eq("status", "완료")
    .gte("created_at", since.toISOString());
  if (error) throw error;

  const phones = new Set(
    (data ?? [])
      .map((r: { phone: string }) => r.phone?.trim())
      .filter((p): p is string => Boolean(p)),
  );
  return [...phones];
}

/**
 * 카카오 매니저 콘텐츠를 최근(6개월 이내) 완료 거래 고객에게 친구톡으로 자동 발송한다.
 * 채널을 구독한 불특정 다수에게 도달하는 것이 아니라, 전화번호를 이미 알고 있는
 * 기존 고객에게만 도달한다 — KAKAO_FRIENDTALK_BROADCAST_ENABLED=true일 때만 동작.
 */
export async function broadcastKakaoFriendTalkToCustomers(
  title: string,
  content: string,
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!KAKAO_FRIENDTALK_BROADCAST_ENABLED) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const phones = await getRecentCustomerPhones();
  const message =
    `(광고) ${title}\n\n${content.slice(0, 700)}\n\n` +
    `[우리집 전기주치의] 최근 이용해주신 고객님께 안내드립니다. 수신을 원치 않으시면 회신 부탁드립니다.`;

  let sent = 0;
  let failed = 0;
  for (const phone of phones) {
    try {
      await sendKakaoFriendTalk(phone, message);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed, skipped: false };
}

/** 콘텐츠 승인 대기 요약 알림 (수요일 cron) */
export async function sendContentApprovalNotification(summary: string): Promise<void> {
  await sendKakaoMemo(`[콘텐츠 승인 요청]\n${summary}`);
}

/** 개선 요청 접수 완료 알림 — GitHub Issue 생성 시 */
export async function notifyImprovementRequestReceived(title: string, issueUrl: string): Promise<void> {
  await sendKakaoMemo(`[개선요청 접수]\n${title}\n\nGitHub Issue가 생성되어 자동 구현이 시작됩니다.`, issueUrl);
}

/** 개선 요청 구현 완료 알림 — PR 머지·배포 완료 시 */
export async function notifyImprovementRequestCompleted(title: string, prUrl: string): Promise<void> {
  await sendKakaoMemo(`[개선요청 완료]\n${title}\n\n자동 구현 및 배포가 완료되었습니다.`, prUrl);
}

/** 매일 아침 이상신호+성장기회 스캔 알림 — daily-business-scan cron에서 호출 */
export async function notifyDailyBusinessScan(params: {
  summary: string;
  anomalies: { title: string }[];
  opportunities: { title: string }[];
}): Promise<void> {
  const lines = [`[아침 스캔] ${params.summary}`];
  if (params.anomalies.length > 0) {
    lines.push(`⚠️ 이상신호: ${params.anomalies.map((a) => a.title).join(", ")}`);
  }
  if (params.opportunities.length > 0) {
    lines.push(`💡 성장기회: ${params.opportunities.map((o) => o.title).join(", ")}`);
  }
  await sendKakaoMemo(lines.join("\n"), "https://hq.dkansim.com");
}

/** Vercel 프로덕션 배포 완료/실패 알림 — Vercel 웹훅(deployment.succeeded/deployment.error)에서 호출 */
export async function notifyVercelDeployment(params: {
  status: "succeeded" | "error";
  projectName: string;
  deploymentUrl: string;
  commitSha?: string;
  commitMessage?: string;
  inspectorUrl?: string;
}): Promise<void> {
  const shaLine = params.commitSha ? `커밋: ${params.commitSha.slice(0, 7)}` : "";
  const msgLine = params.commitMessage ? params.commitMessage.split("\n")[0].slice(0, 80) : "";
  if (params.status === "succeeded") {
    await sendKakaoMemo(
      `[배포 완료]\n${params.projectName} 프로덕션 배포가 완료되었습니다.\n${msgLine}\n${shaLine}`.trim(),
      `https://${params.deploymentUrl}`,
    );
  } else {
    await sendKakaoMemo(
      `[배포 실패] ⚠️\n${params.projectName} 프로덕션 배포가 실패했습니다.\n${msgLine}\n${shaLine}\n확인이 필요합니다.`.trim(),
      params.inspectorUrl ?? `https://${params.deploymentUrl}`,
    );
  }
}
