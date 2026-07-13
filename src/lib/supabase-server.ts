import { normalizeSupabaseProjectUrl } from "@/lib/supabase-url";

const SUPABASE_URL = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
export const SUPABASE_DATA_BUCKET = process.env.SUPABASE_DATA_BUCKET ?? "dk-safety-data";
export const SUPABASE_UPLOAD_BUCKET = process.env.SUPABASE_UPLOAD_BUCKET ?? "dk-safety-uploads";

function assertSupabaseConfig() {
  if (!SUPABASE_ENABLED) {
    throw new Error("Supabase 설정이 누락되었습니다.");
  }
}

function supabaseHeaders(contentType?: string, upsert = false): HeadersInit {
  const headers: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  if (upsert) {
    headers["x-upsert"] = "true";
  }
  return headers;
}

function encodeObjectPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export async function readJsonObject<T>(bucket: string, objectPath: string): Promise<T | null> {
  assertSupabaseConfig();
  const encodedPath = encodeObjectPath(objectPath);
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodedPath}`, {
    method: "GET",
    headers: supabaseHeaders()
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    // Supabase Storage는 존재하지 않는 오브젝트에 HTTP 404가 아니라 400을 주면서 본문에
    // {"statusCode":"404","error":"not_found",...}를 담아 보내는 경우가 실제로 있다(직접
    // 재현 확인함, 2026-07-11). HTTP 코드만 보고 예외를 던지면 "아직 한 번도 안 써본 키를
    // 읽는" 정상적인 흐름까지 에러로 죽는다 — 본문의 논리적 상태도 함께 확인한다.
    const bodyText = await response.text().catch(() => "");
    try {
      const body = JSON.parse(bodyText) as { statusCode?: string; error?: string };
      if (body.statusCode === "404" || body.error === "not_found") {
        return null;
      }
    } catch {
      // 본문이 JSON이 아니면 그냥 아래에서 원래 에러로 던진다.
    }
    throw new Error(`Supabase JSON 읽기 실패: ${response.status} ${bodyText.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

export async function writeJsonObject<T>(bucket: string, objectPath: string, value: T): Promise<void> {
  assertSupabaseConfig();
  const encodedPath = encodeObjectPath(objectPath);
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodedPath}`, {
    method: "POST",
    headers: supabaseHeaders("application/json", true),
    body: JSON.stringify(value, null, 2)
  });
  if (!response.ok) {
    throw new Error(`Supabase JSON 저장 실패: ${response.status}`);
  }
}

export type StorageObjectInfo = {
  name: string;
  updatedAt: string;
  sizeBytes: number;
};

/** prefix 아래 객체 목록 — 백업 스냅샷처럼 파일시스템 readdir 대신 쓰는 용도. */
export async function listStorageObjects(bucket: string, prefix: string): Promise<StorageObjectInfo[]> {
  assertSupabaseConfig();
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: supabaseHeaders("application/json"),
    body: JSON.stringify({
      prefix,
      limit: 1000,
      sortBy: { column: "name", order: "desc" }
    })
  });
  if (!response.ok) {
    throw new Error(`Supabase Storage 목록 조회 실패: ${response.status}`);
  }
  const items = (await response.json()) as Array<{
    name: string;
    updated_at?: string;
    metadata?: { size?: number } | null;
  }>;
  return items
    .filter((item) => item.name && !item.name.endsWith("/"))
    .map((item) => ({
      name: item.name,
      updatedAt: item.updated_at ?? new Date().toISOString(),
      sizeBytes: item.metadata?.size ?? 0
    }));
}

/** 여러 객체를 한 번에 삭제 — 백업 보관 개수 제한(pruning)용. */
export async function deleteStorageObjects(bucket: string, objectPaths: string[]): Promise<void> {
  if (objectPaths.length === 0) return;
  assertSupabaseConfig();
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: supabaseHeaders("application/json"),
    body: JSON.stringify({ prefixes: objectPaths })
  });
  if (!response.ok) {
    throw new Error(`Supabase Storage 삭제 실패: ${response.status}`);
  }
}

/** private 버킷의 객체를 잠깐 공개 접근 가능하게 하는 서명 URL 발급 (기본 10분) — 보미 증권 문서처럼 공개 버킷에 못 올리는 민감 파일용. */
export async function createSignedObjectUrl(
  bucket: string,
  objectPath: string,
  expiresInSec = 600
): Promise<string> {
  assertSupabaseConfig();
  const encodedPath = encodeObjectPath(objectPath);
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${encodedPath}`, {
    method: "POST",
    headers: supabaseHeaders("application/json"),
    body: JSON.stringify({ expiresIn: expiresInSec })
  });
  if (!response.ok) {
    throw new Error(`서명 URL 발급 실패: ${response.status} ${await response.text().catch(() => "")}`);
  }
  const data = (await response.json()) as { signedURL?: string };
  if (!data.signedURL) {
    throw new Error("서명 URL 응답이 비어 있습니다.");
  }
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
}

export async function uploadBinaryObject(params: {
  bucket: string;
  objectPath: string;
  contentType: string;
  data: Uint8Array;
}): Promise<string> {
  assertSupabaseConfig();
  const encodedPath = encodeObjectPath(params.objectPath);
  const payload = params.data.buffer.slice(
    params.data.byteOffset,
    params.data.byteOffset + params.data.byteLength
  ) as ArrayBuffer;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${params.bucket}/${encodedPath}`, {
    method: "POST",
    headers: supabaseHeaders(params.contentType || "application/octet-stream", true),
    body: new Blob([payload], { type: params.contentType || "application/octet-stream" })
  });
  if (!response.ok) {
    throw new Error(`Supabase 파일 업로드 실패: ${response.status}`);
  }
  const fallbackBase = `${SUPABASE_URL}/storage/v1/object/public/${params.bucket}`;
  const overrideBase =
    params.bucket === SUPABASE_UPLOAD_BUCKET ? process.env.SUPABASE_UPLOAD_PUBLIC_BASE_URL?.trim() : undefined;
  const publicBaseUrl = (overrideBase || fallbackBase).replace(/\/+$/, "");
  const objectRel = params.objectPath.replace(/^\/+/, "");
  return `${publicBaseUrl}/${objectRel}`;
}
