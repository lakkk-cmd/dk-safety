import { createHmac, timingSafeEqual } from "crypto";
import { WORKER_SESSION_SECRET } from "@/lib/site-config";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 12;

function sessionSecret(): string {
  const s = WORKER_SESSION_SECRET.trim();
  if (!s) {
    throw new Error("WORKER_SESSION_SECRET 환경 변수를 설정해주세요.");
  }
  return s;
}

export function signWorkerSessionToken(workerId: string): { token: string; maxAge: number } {
  const exp = Date.now() + COOKIE_MAX_AGE_SEC * 1000;
  const payload = `${workerId}.${exp}`;
  const sig = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  const token = `${payload}.${sig}`;
  return { token, maxAge: COOKIE_MAX_AGE_SEC };
}

export function verifyWorkerSessionToken(token: string | undefined | null): { workerId: string } | null {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const sig = token.slice(lastDot + 1);
  const payload = token.slice(0, lastDot);
  const parts = payload.split(".");
  if (parts.length !== 2) return null;
  const [workerId, expStr] = parts;
  const exp = Number(expStr);
  if (!workerId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const secret = WORKER_SESSION_SECRET?.trim();
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
  return { workerId };
}
