import { createHmac, timingSafeEqual } from "crypto";
import { ADMIN_SESSION_SECRET } from "@/lib/site-config";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 8;

/**
 * 로그인한 관리자 계정을 식별하는 보조 세션 — worker-auth.ts와 동일한 HMAC 서명 패턴.
 * ADMIN_SESSION_SECRET이 비어 있으면 null을 돌려줘 호출부가 "식별 쿠키 생략"으로
 * 처리하게 한다(마스터 비밀번호 로그인 자체는 이 값과 무관하게 항상 동작해야 함).
 */
export function signAdminSessionToken(accountId: string): { token: string; maxAge: number } | null {
  const secret = ADMIN_SESSION_SECRET.trim();
  if (!secret) return null;
  const exp = Date.now() + COOKIE_MAX_AGE_SEC * 1000;
  const payload = `${accountId}.${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  const token = `${payload}.${sig}`;
  return { token, maxAge: COOKIE_MAX_AGE_SEC };
}

export function verifyAdminSessionToken(token: string | undefined | null): { accountId: string } | null {
  if (!token) return null;
  const secret = ADMIN_SESSION_SECRET.trim();
  if (!secret) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const sig = token.slice(lastDot + 1);
  const payload = token.slice(0, lastDot);
  const parts = payload.split(".");
  if (parts.length !== 2) return null;
  const [accountId, expStr] = parts;
  const exp = Number(expStr);
  if (!accountId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expectedSig = createHmac("sha256", secret).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { accountId };
}
