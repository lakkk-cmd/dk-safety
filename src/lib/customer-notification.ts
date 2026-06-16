/**
 * 고객 알림 발송
 *
 * 우선순위:
 * 1. Solapi 알림톡 (SOLAPI_API_KEY + SOLAPI_TEMPLATE_ID 모두 설정된 경우)
 * 2. KAKAO_ALIMTALK_WEBHOOK_URL (레거시 webhook fallback)
 * 3. SMS_WEBHOOK_URL (레거시 SMS fallback)
 *
 * 템플릿 심사 대기 중에는 SOLAPI_TEMPLATE_ID를 비워두면 graceful skip.
 */

// ─── Solapi 환경변수 ──────────────────────────────────────────────────────────
// SOLAPI_API_KEY       : Solapi 콘솔 → 개발 → API Key 관리 → API Key
// SOLAPI_API_SECRET    : 위와 동일 화면 → API Secret
// SOLAPI_PFID          : Solapi 콘솔 → 카카오 → 채널 관리 → 채널 ID (KA#...)
// SOLAPI_SENDER_NUMBER : 등록된 발신번호 (예: 01012345678)
// SOLAPI_TEMPLATE_ID   : 카카오 알림톡 템플릿 ID (심사 승인 후 입력)
// NAVER_REVIEW_URL     : (선택) 네이버 지도 리뷰 작성 링크

type ReservationForNotification = {
  id: string;
  name: string;
  phone: string;
  apartmentName?: string | null;
  serviceType: string;
  preferredDate: string;
  preferredTime: string;
};

function normalizePhoneDigits(value: string): string {
  return value.replaceAll(/[^0-9]/g, "");
}

function buildCompletionMessage(reservation: ReservationForNotification): string {
  const apartmentText = reservation.apartmentName?.trim() ? `${reservation.apartmentName} ` : "";
  return [
    `${reservation.name} 고객님, ${apartmentText}${reservation.serviceType} 작업이 완료되었습니다.`,
    `예약일시: ${reservation.preferredDate} ${reservation.preferredTime}`,
    "이용해 주셔서 감사합니다.",
  ].join("\n");
}

// ─── Solapi 알림톡 ───────────────────────────────────────────────────────────

function buildReportUrl(reservationId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://dkansim.com").replace(/\/$/, "");
  return `${base}/verify/${reservationId}`;
}

/**
 * Solapi SDK로 카카오 알림톡 단건 발송.
 * 템플릿 변수: #{고객명}, #{점검일시}, #{결과링크}, #{리뷰링크}
 *
 * 환경변수 SOLAPI_TEMPLATE_ID 미설정 시 graceful skip (템플릿 심사 대기).
 * 그 외 필수 env 미설정 시에도 throw 없이 false 반환.
 */
async function sendSolapiAlimtalk(reservation: ReservationForNotification): Promise<boolean> {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const pfId = process.env.SOLAPI_PFID?.trim();
  const senderNumber = process.env.SOLAPI_SENDER_NUMBER?.trim();
  const templateId = process.env.SOLAPI_TEMPLATE_ID?.trim();

  if (!apiKey || !apiSecret || !pfId || !senderNumber) return false;
  if (!templateId) {
    // 템플릿 심사 대기 중 — graceful skip
    console.log("[solapi] SOLAPI_TEMPLATE_ID 미설정 — 알림톡 발송 건너뜀 (템플릿 심사 대기 중)");
    return false;
  }

  const { SolapiMessageService } = await import("solapi");
  const client = new SolapiMessageService(apiKey, apiSecret);

  const to = normalizePhoneDigits(reservation.phone);
  const reviewUrl = process.env.NAVER_REVIEW_URL?.trim() ?? "https://dkansim.com";
  const reportUrl = buildReportUrl(reservation.id);
  const dateTime = `${reservation.preferredDate} ${reservation.preferredTime}`;
  const fallbackText = buildCompletionMessage(reservation);

  await client.send({
    to,
    from: senderNumber,
    text: fallbackText, // SMS 대체 발송 텍스트 (disableSms 미설정 시 사용)
    kakaoOptions: {
      pfId,
      templateId,
      variables: {
        고객명: reservation.name,
        점검일시: dateTime,
        결과링크: reportUrl,
        리뷰링크: reviewUrl,
      },
    },
  });

  return true;
}

// ─── 레거시 Webhook fallback ──────────────────────────────────────────────────

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`알림 전송 실패(${response.status}): ${text || response.statusText}`);
  }
}

async function sendKakaoAlimtalkWebhook(
  webhookUrl: string,
  reservation: ReservationForNotification,
  message: string,
): Promise<void> {
  await postJson(webhookUrl, {
    channel: "kakao_alimtalk",
    event: "work_completed",
    reservationId: reservation.id,
    to: normalizePhoneDigits(reservation.phone),
    customerName: reservation.name,
    message,
  });
}

async function sendSmsWebhook(
  webhookUrl: string,
  reservation: ReservationForNotification,
  message: string,
): Promise<void> {
  await postJson(webhookUrl, {
    channel: "sms",
    event: "work_completed",
    reservationId: reservation.id,
    to: normalizePhoneDigits(reservation.phone),
    customerName: reservation.name,
    message,
  });
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

export async function notifyCustomerWorkCompleted(reservation: ReservationForNotification): Promise<string[]> {
  const message = buildCompletionMessage(reservation);
  const sentChannels: string[] = [];

  // 1순위: Solapi 알림톡
  try {
    const sent = await sendSolapiAlimtalk(reservation);
    if (sent) sentChannels.push("kakao_alimtalk_solapi");
  } catch (err) {
    console.error("[solapi] 알림톡 발송 실패:", err instanceof Error ? err.message : err);
  }

  // 2순위: 레거시 카카오 webhook (Solapi 미사용 시에만)
  const kakaoWebhook = process.env.KAKAO_ALIMTALK_WEBHOOK_URL?.trim() ?? "";
  if (kakaoWebhook && !sentChannels.length) {
    await sendKakaoAlimtalkWebhook(kakaoWebhook, reservation, message);
    sentChannels.push("kakao_alimtalk");
  }

  // 3순위: SMS webhook
  const smsWebhook = process.env.SMS_WEBHOOK_URL?.trim() ?? "";
  if (smsWebhook) {
    await sendSmsWebhook(smsWebhook, reservation, message);
    sentChannels.push("sms");
  }

  return sentChannels;
}
