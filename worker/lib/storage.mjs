/**
 * Supabase Storage 업로드 공용 헬퍼 (video/blog 워커 공용).
 * sb_secret 키는 JWT가 아니므로 apikey 헤더가 반드시 함께 필요하다
 * (Authorization만 보내면 403 "Invalid Compact JWS").
 */

function requireEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  return { url, key };
}

/** 업로드 후 public URL 반환 */
export async function uploadToStorage({ bucket, objectPath, body, contentType }) {
  const { url, key } = requireEnv();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) throw new Error(`Storage 업로드 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `${url}/storage/v1/object/public/${bucket}/${objectPath}`;
}

/** Storage 경로(또는 완전한 URL)를 public URL로 변환 */
export function toPublicUrl(bucket, pathOrUrl) {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const { url } = requireEnv();
  return `${url}/storage/v1/object/public/${bucket}/${pathOrUrl.replace(/^\//, "")}`;
}
