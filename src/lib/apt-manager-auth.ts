import { createHmac, timingSafeEqual } from "crypto";
import { APT_MANAGER_SESSION_SECRET } from "@/lib/site-config";

// 워커(12시간, 교대근무 전제)와 달리 전기과장은 어쩌다 한 번 쓰는 계정이라 매번
// 로그인시키면 이탈 요인이 된다 — 30일로 길게 잡는다(2026-08-25 설계 결정).
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

function sessionSecret(): string {
  const s = APT_MANAGER_SESSION_SECRET.trim();
  if (!s) {
    throw new Error("APT_MANAGER_SESSION_SECRET 환경 변수를 설정해주세요.");
  }
  return s;
}

export function signApartmentManagerSessionToken(managerId: string): { token: string; maxAge: number } {
  const exp = Date.now() + COOKIE_MAX_AGE_SEC * 1000;
  const payload = `${managerId}.${exp}`;
  const sig = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  const token = `${payload}.${sig}`;
  return { token, maxAge: COOKIE_MAX_AGE_SEC };
}

export function verifyApartmentManagerSessionToken(token: string | undefined | null): { managerId: string } | null {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const sig = token.slice(lastDot + 1);
  const payload = token.slice(0, lastDot);
  const parts = payload.split(".");
  if (parts.length !== 2) return null;
  const [managerId, expStr] = parts;
  const exp = Number(expStr);
  if (!managerId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const secret = APT_MANAGER_SESSION_SECRET?.trim();
  if (!secret) return null;
  const expectedSig = createHmac("sha256", secret).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { managerId };
}
