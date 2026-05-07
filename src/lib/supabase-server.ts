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
    throw new Error(`Supabase JSON 읽기 실패: ${response.status}`);
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
  const publicBaseUrl = (process.env.SUPABASE_UPLOAD_PUBLIC_BASE_URL?.trim() || fallbackBase).replace(/\/+$/, "");
  const objectRel = params.objectPath.replace(/^\/+/, "");
  return `${publicBaseUrl}/${objectRel}`;
}
