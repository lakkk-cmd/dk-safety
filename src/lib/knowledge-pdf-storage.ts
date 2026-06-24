/** /admin/knowledge PDF 원본 저장 — private 버킷(knowledge-pdfs) 전용 Storage REST 헬퍼 */

import { normalizeSupabaseProjectUrl } from "@/lib/supabase-url";

const SUPABASE_URL = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const KNOWLEDGE_PDF_BUCKET = process.env.SUPABASE_KNOWLEDGE_BUCKET ?? "knowledge-pdfs";

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase 설정이 누락되었습니다.");
  }
}

function headers(contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  };
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export async function uploadKnowledgePdf(objectPath: string, data: Buffer, contentType = "application/pdf"): Promise<void> {
  assertConfig();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${KNOWLEDGE_PDF_BUCKET}/${encodePath(objectPath)}`, {
    method: "POST",
    headers: { ...headers(contentType), "x-upsert": "true" },
    body: new Blob([new Uint8Array(data)], { type: contentType })
  });
  if (!res.ok) {
    throw new Error(`PDF 업로드 실패: ${res.status} ${await res.text().catch(() => "")}`);
  }
}

/** 클라이언트가 Vercel 서버리스 함수의 본문 크기 제한(4.5MB)을 거치지 않고 브라우저에서
 *  Supabase Storage로 직접 PUT할 수 있는 1회용 서명 업로드 URL을 발급한다. */
export async function createKnowledgeUploadSignedUrl(objectPath: string): Promise<string> {
  assertConfig();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${KNOWLEDGE_PDF_BUCKET}/${encodePath(objectPath)}`, {
    method: "POST",
    headers: headers("application/json"),
    body: JSON.stringify({})
  });
  if (!res.ok) {
    throw new Error(`업로드 URL 생성 실패: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("업로드 URL 생성 실패: 응답에 url이 없습니다.");
  return `${SUPABASE_URL}/storage/v1${data.url}`;
}

export async function downloadKnowledgePdf(objectPath: string): Promise<Buffer> {
  assertConfig();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${KNOWLEDGE_PDF_BUCKET}/${encodePath(objectPath)}`, {
    headers: headers()
  });
  if (!res.ok) {
    throw new Error(`PDF 다운로드 실패: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function moveKnowledgePdf(fromPath: string, toPath: string): Promise<void> {
  assertConfig();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/move`, {
    method: "POST",
    headers: headers("application/json"),
    body: JSON.stringify({ bucketId: KNOWLEDGE_PDF_BUCKET, sourceKey: fromPath, destinationKey: toPath })
  });
  if (!res.ok) {
    throw new Error(`PDF 이동 실패: ${res.status} ${await res.text().catch(() => "")}`);
  }
}

export async function deleteKnowledgePdf(objectPath: string): Promise<void> {
  assertConfig();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${KNOWLEDGE_PDF_BUCKET}/${encodePath(objectPath)}`, {
    method: "DELETE",
    headers: headers()
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`PDF 삭제 실패: ${res.status}`);
  }
}

export async function ensureKnowledgeBucket(): Promise<void> {
  assertConfig();
  const list = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, { headers: headers() });
  if (!list.ok) return;
  const buckets = (await list.json()) as Array<{ id: string }>;
  if (buckets.some((b) => b.id === KNOWLEDGE_PDF_BUCKET)) return;
  await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: headers("application/json"),
    body: JSON.stringify({ id: KNOWLEDGE_PDF_BUCKET, name: KNOWLEDGE_PDF_BUCKET, public: false })
  });
}
