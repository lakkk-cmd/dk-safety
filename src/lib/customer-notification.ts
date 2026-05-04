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
    "이용해 주셔서 감사합니다."
  ].join("\n");
}

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`알림 전송 실패(${response.status}): ${text || response.statusText}`);
  }
}

async function sendKakaoAlimtalk(
  webhookUrl: string,
  reservation: ReservationForNotification,
  message: string
): Promise<void> {
  await postJson(webhookUrl, {
    channel: "kakao_alimtalk",
    event: "work_completed",
    reservationId: reservation.id,
    to: normalizePhoneDigits(reservation.phone),
    customerName: reservation.name,
    message
  });
}

async function sendSms(webhookUrl: string, reservation: ReservationForNotification, message: string): Promise<void> {
  await postJson(webhookUrl, {
    channel: "sms",
    event: "work_completed",
    reservationId: reservation.id,
    to: normalizePhoneDigits(reservation.phone),
    customerName: reservation.name,
    message
  });
}

export async function notifyCustomerWorkCompleted(reservation: ReservationForNotification): Promise<string[]> {
  const kakaoWebhook = process.env.KAKAO_ALIMTALK_WEBHOOK_URL?.trim() ?? "";
  const smsWebhook = process.env.SMS_WEBHOOK_URL?.trim() ?? "";
  const message = buildCompletionMessage(reservation);
  const sentChannels: string[] = [];

  if (kakaoWebhook) {
    await sendKakaoAlimtalk(kakaoWebhook, reservation, message);
    sentChannels.push("kakao_alimtalk");
  }
  if (smsWebhook) {
    await sendSms(smsWebhook, reservation, message);
    sentChannels.push("sms");
  }

  return sentChannels;
}
