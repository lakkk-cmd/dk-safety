/** 인증 없는 공개 API 라우트용 IP 기반 레이트리밋. 인메모리 Map이라 완벽한 방어는 아니다 —
 *  Vercel 서버리스는 인스턴스가 재활용될 때마다 메모리가 초기화되므로 우회당할 수 있다.
 *  그래도 스크립트성 남용(같은 인스턴스에서의 연타 요청)은 비용 없이 걸러낸다.
 *  더 강한 보장이 필요하면 Supabase 테이블 기반 카운터로 교체할 것. */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function getClientIp(request: Request): string {
  const headers = request.headers;
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * key(라우트별 네임스페이스) + IP 조합으로 windowMs 안에 limit회까지만 허용한다.
 * 사용: const rl = checkIpRateLimit(request, "resident-login", 10, 60 * 60 * 1000);
 *       if (!rl.allowed) return NextResponse.json({...}, { status: 429 });
 */
export function checkIpRateLimit(
  request: Request,
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; ip: string } {
  const ip = getClientIp(request);
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(bucketKey);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, ip };
  }

  if (bucket.count >= limit) {
    return { allowed: false, ip };
  }

  bucket.count += 1;
  return { allowed: true, ip };
}
