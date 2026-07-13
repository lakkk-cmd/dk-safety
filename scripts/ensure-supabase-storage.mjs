/**
 * 서비스 롤(또는 sb_secret_)로 Storage 버킷이 없으면 생성합니다.
 * 사용: npm run storage:ensure
 */
function normalizeSupabaseProjectUrl(raw) {
  let u = String(raw ?? "").trim();
  if (!u) return u;
  u = u.replace(/\/$/, "");
  u = u.replace(/\/rest\/v1\/?$/i, "");
  return u.replace(/\/$/, "");
}

const url = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`
};

async function listBuckets() {
  const res = await fetch(`${url}/storage/v1/bucket`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`버킷 목록 실패 ${res.status}: ${text}`);
  }
  return await res.json();
}

async function createBucket(id, isPublic) {
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ id, name: id, public: Boolean(isPublic) })
  });
  if (res.status === 409 || res.status === 400) {
    const text = await res.text();
    if (text.includes("already exists") || res.status === 409) {
      console.log(`버킷 이미 있음: ${id}`);
      return;
    }
    throw new Error(`버킷 생성 실패 ${res.status}: ${text}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`버킷 생성 실패 ${res.status}: ${text}`);
  }
  console.log(`버킷 생성됨: ${id} (public=${isPublic})`);
}

const uploadId = process.env.SUPABASE_UPLOAD_BUCKET ?? "dk-safety-uploads";
const dataId = process.env.SUPABASE_DATA_BUCKET ?? "dk-safety-data";
const videoId = process.env.SUPABASE_VIDEO_BUCKET ?? "dk-safety-video-assets";
const knowledgeId = process.env.SUPABASE_KNOWLEDGE_BUCKET ?? "knowledge-pdfs";
const documentsId = process.env.SUPABASE_DOCUMENTS_BUCKET ?? "dk-safety-documents";
const apksId = process.env.SUPABASE_APK_BUCKET ?? "dk-safety-apks";
const bomiDocumentsId = process.env.SUPABASE_BOMI_DOCUMENTS_BUCKET ?? "dk-bomi-documents";

const buckets = await listBuckets();
const ids = new Set(buckets.map((b) => b.id));

if (!ids.has(uploadId)) {
  await createBucket(uploadId, true);
  ids.add(uploadId);
} else {
  console.log("업로드 버킷 이미 있음:", uploadId);
}

if (!ids.has(dataId)) {
  await createBucket(dataId, false);
} else {
  console.log("데이터 버킷 이미 있음:", dataId);
}

if (!ids.has(videoId)) {
  await createBucket(videoId, true);
} else {
  console.log("영상 자산 버킷 이미 있음:", videoId);
}

if (!ids.has(knowledgeId)) {
  await createBucket(knowledgeId, false);
} else {
  console.log("지식베이스 PDF 버킷 이미 있음:", knowledgeId);
}

if (!ids.has(documentsId)) {
  await createBucket(documentsId, true);
} else {
  console.log("문서 버킷 이미 있음:", documentsId);
}

if (!ids.has(apksId)) {
  await createBucket(apksId, true);
} else {
  console.log("모바일 앱 APK 버킷 이미 있음:", apksId);
}

// 보미(보험설계사 CRM) 증권/신분증 스캔 — 민감 문서라 private로 생성, 서명 URL로만 열람.
if (!ids.has(bomiDocumentsId)) {
  await createBucket(bomiDocumentsId, false);
} else {
  console.log("보미 문서 버킷 이미 있음:", bomiDocumentsId);
}

console.log("Storage 점검 완료.");
