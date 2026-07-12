/* eslint-disable @typescript-eslint/no-explicit-any */
// 에이전트 직접 SMS/LMS 발송
// 환경변수: SOLAPI_API_KEY_ID (또는 SOLAPI_API_KEY), SOLAPI_API_SECRET_KEY (또는 SOLAPI_API_SECRET), SOLAPI_SENDER_NUMBER

import { ADMIN_ALERT_PHONE } from "@/lib/site-config";

function getSolapiEnv(): { apiKey: string; apiSecret: string; senderNumber: string } {
  const apiKey = process.env.SOLAPI_API_KEY_ID?.trim() || process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET_KEY?.trim() || process.env.SOLAPI_API_SECRET?.trim();
  const senderNumber = process.env.SOLAPI_SENDER_NUMBER?.trim();
  if (!apiKey || !apiSecret || !senderNumber) {
    throw new Error(
      "Solapi 환경변수 미설정: SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER 확인 필요",
    );
  }
  return { apiKey, apiSecret, senderNumber };
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export type SolapiSendResult = {
  to: string;
  messageId?: string;
  statusCode?: string;
  error?: string;
};

/** 단문 문자 발송 */
export async function sendSMS(to: string, text: string): Promise<SolapiSendResult> {
  const { apiKey, apiSecret, senderNumber } = getSolapiEnv();
  const { SolapiMessageService } = await import("solapi");
  const client = new SolapiMessageService(apiKey, apiSecret);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await client.send({
    to: normalizePhone(to),
    from: senderNumber,
    text,
  })) as any;
  return { to, messageId: result?.messageId, statusCode: result?.statusCode };
}

/** 장문 문자 발송 */
export async function sendLMS(to: string, title: string, text: string): Promise<SolapiSendResult> {
  const { apiKey, apiSecret, senderNumber } = getSolapiEnv();
  const { SolapiMessageService } = await import("solapi");
  const client = new SolapiMessageService(apiKey, apiSecret);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await client.send({
    to: normalizePhone(to),
    from: senderNumber,
    subject: title,
    text,
    type: "LMS",
  })) as any;
  return { to, messageId: result?.messageId, statusCode: result?.statusCode };
}

/**
 * 카카오톡 채널 친구톡 발송 — 알림톡과 달리 템플릿 사전승인 없이 pfId만으로 자유 작성 가능.
 * SOLAPI_PFID 환경변수(연동된 카카오톡 채널)가 필요하다.
 */
export async function sendKakaoFriendTalk(to: string, text: string): Promise<SolapiSendResult> {
  const { apiKey, apiSecret, senderNumber } = getSolapiEnv();
  const pfId = process.env.SOLAPI_PFID?.trim();
  if (!pfId) throw new Error("SOLAPI_PFID가 설정되지 않았습니다.");

  const { SolapiMessageService } = await import("solapi");
  const client = new SolapiMessageService(apiKey, apiSecret);
  const result = (await client.send({
    to: normalizePhone(to),
    from: senderNumber,
    text,
    kakaoOptions: { pfId },
  })) as any;
  return { to, messageId: result?.messageId, statusCode: result?.statusCode };
}

export type BulkTarget = { to: string };

/** 동일 메시지 대량 발송 */
export async function sendBulk(targets: BulkTarget[], text: string): Promise<SolapiSendResult[]> {
  const { apiKey, apiSecret, senderNumber } = getSolapiEnv();
  const { SolapiMessageService } = await import("solapi");
  const client = new SolapiMessageService(apiKey, apiSecret);
  const messages = targets.map((t) => ({
    to: normalizePhone(t.to),
    from: senderNumber,
    text,
  }));
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (await (client as any).sendMany(messages)) as any[];
    return Array.isArray(results)
      ? results.map((r, i) => ({ to: targets[i]?.to ?? "", messageId: r?.messageId }))
      : targets.map((t) => ({ to: t.to }));
  } catch {
    // sendMany 미지원 시 개별 발송 fallback
    const results: SolapiSendResult[] = [];
    for (const { to } of targets) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = (await client.send({ to: normalizePhone(to), from: senderNumber, text })) as any;
        results.push({ to, messageId: r?.messageId });
      } catch (err) {
        results.push({ to, error: err instanceof Error ? err.message : "실패" });
      }
    }
    return results;
  }
}

/**
 * 대표님 개인 휴대폰(ADMIN_ALERT_PHONE)으로 SMS 발송 — 승인대기/예약접수 등 "즉시 확인이
 * 필요한" 알림 전용. 카카오 "나에게 보내기"(kakao-publish.ts)와 달리 문자 팝업으로 바로
 * 뜨기 때문에 즉시성이 중요한 알림에 쓴다. ADMIN_ALERT_PHONE 미설정 시 명확한 에러를
 * 던지므로, 실패해도 호출 흐름이 막히면 안 되는 곳에서는 반드시 호출부에서 감싼다.
 */
export async function sendAdminAlertSms(text: string): Promise<SolapiSendResult> {
  const to = ADMIN_ALERT_PHONE.trim();
  if (!to) {
    throw new Error("ADMIN_ALERT_PHONE 환경변수가 설정되지 않았습니다.");
  }
  return sendSMS(to, text);
}
