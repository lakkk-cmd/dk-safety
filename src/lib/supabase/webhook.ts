export type PaymentWebhookPayload = {
  eventType?: string;
  event_type?: string;
  type?: string;
  orderId?: string;
  merchant_uid?: string;
  status?: string;
  paymentKey?: string;
  imp_uid?: string;
  amount?: number;
  data?: Record<string, unknown>;
};

export function normalizeWebhookOrderId(payload: PaymentWebhookPayload): string {
  return (
    payload.orderId?.trim() ||
    payload.merchant_uid?.trim() ||
    (typeof payload.data?.orderId === "string" ? payload.data.orderId.trim() : "") ||
    (typeof payload.data?.merchant_uid === "string" ? payload.data.merchant_uid.trim() : "")
  );
}

export function normalizeWebhookEventType(payload: PaymentWebhookPayload): string {
  return (
    payload.eventType?.trim() ||
    payload.event_type?.trim() ||
    payload.type?.trim() ||
    (typeof payload.data?.eventType === "string" ? payload.data.eventType.trim() : "") ||
    ""
  ).toUpperCase();
}
