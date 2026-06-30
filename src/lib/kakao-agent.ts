import { requireAgentSupabase } from "@/lib/agent-db";
import { isAgentSupabaseReady } from "@/lib/agent-db";

const KAKAO_API_BASE = "https://kapi.kakao.com";

function getAdminKey(): string {
  const key = process.env.KAKAO_REST_API_KEY?.trim();
  if (!key) throw new Error("KAKAO_REST_API_KEY가 설정되지 않았습니다.");
  return key;
}

function getChannelId(): string {
  const id = process.env.KAKAO_CHANNEL_ID?.trim();
  if (!id) throw new Error("KAKAO_CHANNEL_ID가 설정되지 않았습니다.");
  return id;
}

/**
 * 카카오 비즈니스 채널 알림톡 발송
 * receiver_uuid: Kakao 내부 사용자 UUID (채널 친구 등록 필요)
 * 비즈니스 채널 승인 및 템플릿 심사 완료 후 사용 가능
 */
export async function sendMessage(
  receiverUuid: string,
  templateId: string,
  variables: Record<string, string> = {},
): Promise<{ messageId: string }> {
  const adminKey = getAdminKey();
  const channelPublicId = getChannelId();

  const res = await fetch(`${KAKAO_API_BASE}/v1/api/talk/channel/msg/send`, {
    method: "POST",
    headers: {
      Authorization: `KakaoAK ${adminKey}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({
      receiver_uuids: JSON.stringify([receiverUuid]),
      template_id: templateId,
      template_args: JSON.stringify(variables),
      channel_public_id: channelPublicId,
    }),
  });

  const json = (await res.json()) as { result_code?: string; msg_uid?: string; error_msg?: string };
  if (!res.ok || (json.result_code && json.result_code !== "0")) {
    throw new Error(`카카오 알림톡 발송 실패: ${json.error_msg ?? JSON.stringify(json)}`);
  }
  return { messageId: json.msg_uid ?? "" };
}

/**
 * 카카오 채널 전체 구독자 대상 채널 포스트 발행
 * 채널 관리자 권한 및 비즈니스 채널 승인 필요
 */
export async function sendChannelPost(
  title: string,
  content: string,
  imageUrl?: string,
): Promise<void> {
  const adminKey = getAdminKey();

  const templateObj: Record<string, unknown> = imageUrl
    ? {
        object_type: "feed",
        content: {
          title,
          description: content.slice(0, 200),
          image_url: imageUrl,
          link: {
            web_url: process.env.NEXT_PUBLIC_APP_URL ?? "https://dkansim.com",
            mobile_web_url: process.env.NEXT_PUBLIC_APP_URL ?? "https://dkansim.com",
          },
        },
      }
    : {
        object_type: "text",
        text: `${title}\n\n${content}`.slice(0, 2000),
        link: {
          web_url: process.env.NEXT_PUBLIC_APP_URL ?? "https://dkansim.com",
          mobile_web_url: process.env.NEXT_PUBLIC_APP_URL ?? "https://dkansim.com",
        },
      };

  const res = await fetch(`${KAKAO_API_BASE}/v2/api/talk/memo/default/send`, {
    method: "POST",
    headers: {
      Authorization: `KakaoAK ${adminKey}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObj) }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`카카오 채널 포스트 발행 실패: ${res.status} ${err.slice(0, 200)}`);
  }
}

export async function logNotification(
  type: "alimtalk" | "channel_post",
  recipient: string | null,
  templateId: string | null,
  variables: Record<string, unknown> | null,
  status: "sent" | "failed",
  response: unknown,
  error?: string,
): Promise<void> {
  if (!isAgentSupabaseReady()) return;
  try {
    const supabase = requireAgentSupabase();
    await supabase.from("notification_logs").insert({
      type,
      recipient,
      template_id: templateId,
      variables: variables ?? {},
      status,
      response: response ?? null,
      error: error ?? null,
    });
  } catch (err) {
    console.error("[notification_logs] 기록 실패:", err);
  }
}
