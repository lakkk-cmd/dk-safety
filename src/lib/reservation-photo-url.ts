/**
 * 예약·관리자 화면에서 저장된 `image_urls` 값을 브라우저 `<img src>`에 쓸 수 있는 URL로 맞춥니다.
 * (로컬 `public/uploads` 경로, 누락된 선행 `/`, `public/` 접두사 등)
 */
export function normalizeReservationPhotoUrl(raw: string): string {
  let u = String(raw ?? "").trim();
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  u = u.replace(/^public\//i, "");
  if (!u.startsWith("/")) u = `/${u}`;
  return u.replace(/\/+/g, "/");
}
