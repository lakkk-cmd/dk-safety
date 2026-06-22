/**
 * 진단 리포트(PDF) 알림톡/SMS 발송 — Solapi
 *
 * customer-notification.ts의 work-completion 템플릿(고객명/점검일시/결과링크/리뷰링크)과는
 * 변수셋이 다르므로(고객명/세대주소/위험등급/리포트링크) 같은 SOLAPI_TEMPLATE_ID로 먼저
 * 알림톡을 시도하고, 템플릿 변수 불일치 등으로 실패하면 신규 템플릿 등록 없이
 * 동일 발신번호로 일반 SMS로 폴백한다.
 */

export type SendChannelResult = {
  channel: "kakao_alimtalk" | "sms" | "skipped";
  success: boolean;
  messageId?: string;
  error?: string;
};

function normalizePhoneDigits(value: string): string {
  return value.replaceAll(/[^0-9]/g, "");
}

function buildFallbackText(params: {
  customerName: string;
  apartmentAddress: string;
  riskLevel: string | null;
  reportUrl: string;
}): string {
  return [
    `${params.customerName}님, 우리집 전기주치의(대경이엔피) 세대 진단 리포트가 도착했습니다.`,
    `세대주소: ${params.apartmentAddress}`,
    `위험등급: ${params.riskLevel ?? "확인중"}`,
    `리포트 보기: ${params.reportUrl}`
  ].join("\n");
}

export async function sendFieldReportNotification(params: {
  phone: string;
  customerName: string;
  apartmentAddress: string;
  riskLevel: string | null;
  reportUrl: string;
}): Promise<SendChannelResult> {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const pfId = process.env.SOLAPI_PFID?.trim();
  const senderNumber = process.env.SOLAPI_SENDER_NUMBER?.trim();
  const templateId = process.env.SOLAPI_TEMPLATE_ID?.trim();

  if (!apiKey || !apiSecret || !senderNumber) {
    return { channel: "skipped", success: false, error: "SOLAPI_API_KEY/SECRET/SENDER_NUMBER 미설정" };
  }

  const { SolapiMessageService } = await import("solapi");
  const client = new SolapiMessageService(apiKey, apiSecret);

  const to = normalizePhoneDigits(params.phone);
  const text = buildFallbackText(params);

  if (pfId && templateId) {
    try {
      const result = await client.send({
        to,
        from: senderNumber,
        text,
        kakaoOptions: {
          pfId,
          templateId,
          variables: {
            고객명: params.customerName,
            세대주소: params.apartmentAddress,
            위험등급: params.riskLevel ?? "확인중",
            리포트링크: params.reportUrl
          }
        }
      });
      return { channel: "kakao_alimtalk", success: true, messageId: result.groupInfo.groupId };
    } catch (err) {
      console.warn(
        "[field-report-notification] 알림톡 발송 실패(템플릿 변수 불일치 등) — SMS로 폴백:",
        err instanceof Error ? err.message : err
      );
    }
  }

  try {
    const result = await client.send({ to, from: senderNumber, text });
    return { channel: "sms", success: true, messageId: result.groupInfo.groupId };
  } catch (err) {
    return { channel: "sms", success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
