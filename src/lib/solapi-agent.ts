/* eslint-disable @typescript-eslint/no-explicit-any */
// 에이전트 직접 SMS/LMS 발송
// 환경변수: SOLAPI_API_KEY_ID (또는 SOLAPI_API_KEY), SOLAPI_API_SECRET_KEY (또는 SOLAPI_API_SECRET), SOLAPI_SENDER_NUMBER

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
