/**
 * Supabase URL·키가 유효한지 확인합니다. 서버 로직은 service 키가 핵심입니다.
 * 사용: npm run verify:supabase
 */
function normalizeSupabaseProjectUrl(raw) {
  let u = String(raw ?? "").trim();
  if (!u) return u;
  u = u.replace(/\/$/, "");
  u = u.replace(/\/rest\/v1\/?$/i, "");
  return u.replace(/\/$/, "");
}

const url = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!url || !service) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

const anonPing = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: anon, Authorization: `Bearer ${anon}` }
});
if (anonPing.ok) {
  console.log("anon 키 REST 접근 OK");
} else {
  console.warn(
    "anon 키 REST 응답:",
    anonPing.status,
    "(레거시 JWT가 막혀 있으면 Dashboard에서 Publishable 키를 NEXT_PUBLIC_SUPABASE_ANON_KEY에 넣어도 됩니다. 서버 API는 service 키만 사용합니다.)"
  );
}

const reservations = await fetch(`${url}/rest/v1/reservations?select=id&limit=0`, {
  headers: { apikey: service, Authorization: `Bearer ${service}` }
});
if (reservations.status === 401 || reservations.status === 403) {
  console.error("service 키로 REST 접근 실패:", reservations.status);
  process.exit(1);
}
if (reservations.status === 404) {
  console.log("service 키 OK · reservations 테이블이 아직 없습니다 → npm run db:apply");
} else if (!reservations.ok) {
  console.warn("reservations 조회 응답:", reservations.status);
} else {
  console.log("service 키 OK · reservations 테이블 연결됨");
}
