const KAKAO_MEMO_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send";

export const KAKAO_MEMO_ENABLED = Boolean(process.env.KAKAO_ACCESS_TOKEN?.trim());

/**
 * 카카오톡 "나에게 보내기" API로 메모를 전송한다.
 * 카카오 채널 공개 발행 API는 비즈니스 인증이 필요해 제공되지 않으므로,
 * 대장이 알림을 받아 직접 채널에 발행/확인하는 흐름을 보조한다.
 */
async function sendKakaoMemo(text: string, linkUrl = "https://contents.dkansim.com"): Promise<void> {
  const token = process.env.KAKAO_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("KAKAO_ACCESS_TOKEN이 설정되지 않았습니다. /api/kakao/callback에서 토큰을 발급해주세요.");
  }

  const template = JSON.stringify({
    object_type: "text",
    text: text.slice(0, 200),
    link: { web_url: linkUrl, mobile_web_url: linkUrl },
  });

  const res = await fetch(KAKAO_MEMO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
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

/** 콘텐츠 승인 대기 요약 알림 (수요일 cron) */
export async function sendContentApprovalNotification(summary: string): Promise<void> {
  await sendKakaoMemo(`[콘텐츠 승인 요청]\n${summary}`);
}
