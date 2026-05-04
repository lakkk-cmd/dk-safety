/**
 * Edge Middleware용 기사 세션 토큰 검증 (Node `crypto` 미사용).
 * {@link ./worker-auth.ts} 의 서명 규칙과 동일해야 합니다.
 */
const encoder = new TextEncoder();

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i)! ^ b.charCodeAt(i)!;
  return diff === 0;
}

export async function verifyWorkerSessionTokenEdge(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.WORKER_SESSION_SECRET?.trim();
  if (!secret) return false;

  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return false;
  const sig = token.slice(lastDot + 1);
  const payload = token.slice(0, lastDot);
  const parts = payload.split(".");
  if (parts.length !== 2) return false;
  const [workerId, expStr] = parts;
  const exp = Number(expStr);
  if (!workerId || !Number.isFinite(exp) || exp < Date.now()) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedSig = toBase64Url(signature);

  return timingSafeEqualStrings(sig, expectedSig);
}
