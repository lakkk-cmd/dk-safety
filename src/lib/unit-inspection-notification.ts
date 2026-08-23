/**
 * 세대전기점검(직무고시) 자동 안전진단 결과 알림톡/SMS 발송 — Solapi.
 * field-report-notification.ts와 동일한 전략: 기존 SOLAPI_TEMPLATE_ID로 먼저 알림톡을
 * 시도하고(변수셋이 달라 실패할 가능성이 높음), 실패하면 신규 템플릿 등록 없이 동일
 * 발신번호로 일반 SMS로 폴백한다. 세대점검은 관리사무소 협업으로 확보한 접점을 실제
 * 연락처로 완성하는 단계라, 발송 자체가 핵심 가치이므로 SMS 폴백이 항상 성공하는 게 중요하다.
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

function buildFallbackText(params: { residentName: string; apartmentName: string; badCount: number; reportUrl: string }): string {
  const verdict = params.badCount > 0 ? `부적합 ${params.badCount}건 발견` : "특이사항 없음";
  return [
    `[우리집전기주치의] ${params.residentName}님 세대전기점검 완료.`,
    `결과: ${verdict}`,
    `상세 확인: ${params.reportUrl}`,
    `전기 수리·문의: 010-8945-1111`
  ].join("\n");
}

export async function sendUnitInspectionNotification(params: {
  phone: string;
  residentName: string;
  apartmentName: string;
  badCount: number;
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
      // 등록된 카카오 템플릿의 버튼(linkMo)이 "https://#{리포트링크}"로 스킴을 이미 포함하고
      // 있어서, 변수에 스킴 포함 완전한 URL을 넣으면 "https://https://..." 형태로 깨진다 —
      // 실제 발급된 알림톡 링크를 클릭하면 홈으로 튕기던 버그의 원인(2026-08-24 확인,
      // getKakaoAlimtalkTemplate로 실제 템플릿 조회해 검증). 변수에는 스킴을 뺀 값만 넣는다.
      const linkWithoutScheme = params.reportUrl.replace(/^https?:\/\//, "");
      const result = await client.send({
        to,
        from: senderNumber,
        text,
        kakaoOptions: {
          pfId,
          templateId,
          variables: {
            고객명: params.residentName,
            세대주소: params.apartmentName,
            위험등급: params.badCount > 0 ? "확인필요" : "안전",
            리포트링크: linkWithoutScheme
          }
        }
      });
      return { channel: "kakao_alimtalk", success: true, messageId: result.groupInfo.groupId };
    } catch (err) {
      console.warn(
        "[unit-inspection-notification] 알림톡 발송 실패(템플릿 변수 불일치 등) — SMS로 폴백:",
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
