/**
 * 대표님 목소리 클론 1회성 등록 — fal.ai(Qwen3-TTS) clone-voice API에 참조 음성을 보내
 * speaker_embedding 파일 URL을 발급받는다. 이후 이 URL을 FAL_SPEAKER_EMBEDDING_URL로
 * .env.local / Vercel / GitHub Actions secrets에 저장하면 hq 채팅 "들려주기"와
 * assemble-video.mjs 나레이션(1순위 티어)이 모두 이 목소리를 사용한다.
 *
 * 녹음 가이드: 조용한 곳에서 30초~1분,또박또박, 잡음/음악 없이. 형식은 mp3/wav 등 일반 오디오면 됨.
 *
 * Usage: node --env-file=.env.local scripts/clone-voice-fal.mjs <로컬_오디오_파일_경로> ["녹음한 문장(선택, 있으면 품질 향상)"]
 */
import fs from "node:fs/promises";
import path from "node:path";

function required(value, name) {
  if (!value) throw new Error(`필수 환경변수 누락: ${name}`);
  return value;
}

const SUPABASE_URL = required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY = required(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
const FAL_KEY = required(process.env.FAL_API_KEY, "FAL_API_KEY");
const UPLOAD_BUCKET = process.env.SUPABASE_UPLOAD_BUCKET?.trim() || "dk-safety-uploads";
const FAL_CLONE_MODEL = "fal-ai/qwen-3-tts/clone-voice/1.7b";

const [, , filePath, referenceText] = process.argv;
if (!filePath) {
  console.error("사용법: node --env-file=.env.local scripts/clone-voice-fal.mjs <오디오파일경로> [\"녹음한 문장\"]");
  process.exit(1);
}

const CONTENT_TYPES = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg" };

async function uploadReferenceAudio() {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const bytes = await fs.readFile(filePath);
  const objectPath = `voice-clone/reference-${Date.now()}${ext}`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${UPLOAD_BUCKET}/${objectPath}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": contentType, "x-upsert": "true" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`참조 음성 업로드 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`);

  return `${SUPABASE_URL}/storage/v1/object/public/${UPLOAD_BUCKET}/${objectPath}`;
}

async function falSubmitAndWait(modelId, input, timeoutMs = 60_000) {
  const submitRes = await fetch(`https://queue.fal.run/${modelId}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!submitRes.ok) throw new Error(`fal.ai 요청 실패 (${submitRes.status}): ${(await submitRes.text()).slice(0, 200)}`);
  const { request_id: requestId } = await submitRes.json();
  console.log(`fal.ai 요청 접수됨 (request_id: ${requestId}), 생성 대기 중...`);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const statusRes = await fetch(`https://queue.fal.run/${modelId}/requests/${requestId}/status`, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
    const statusData = await statusRes.json();
    if (statusData.status === "COMPLETED") {
      const resultRes = await fetch(`https://queue.fal.run/${modelId}/requests/${requestId}`, {
        headers: { Authorization: `Key ${FAL_KEY}` },
      });
      if (!resultRes.ok) throw new Error(`fal.ai 결과 조회 실패 (${resultRes.status})`);
      return resultRes.json();
    }
    if (statusData.status === "ERROR") throw new Error(`fal.ai 생성 실패: ${JSON.stringify(statusData).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("fal.ai 응답 시간 초과");
}

async function main() {
  console.log("1) 참조 음성 파일을 Supabase Storage에 업로드 중...");
  const audioUrl = await uploadReferenceAudio();
  console.log(`   업로드 완료: ${audioUrl}`);

  console.log("2) fal.ai clone-voice 호출 중...");
  const result = await falSubmitAndWait(FAL_CLONE_MODEL, {
    audio_url: audioUrl,
    ...(referenceText ? { reference_text: referenceText } : {}),
  });
  const embeddingUrl = result.speaker_embedding.url;

  console.log("\n✅ 목소리 클론 등록 완료!");
  console.log(`speaker_embedding URL: ${embeddingUrl}`);
  console.log("\n다음 값을 저장하세요:");
  console.log(`FAL_API_KEY=${FAL_KEY}`);
  console.log(`FAL_SPEAKER_EMBEDDING_URL=${embeddingUrl}`);
  console.log("\n저장 위치 3곳 모두 필요합니다:");
  console.log("  1. .env.local (로컬 테스트용)");
  console.log("  2. Vercel 프로젝트 환경변수 (hq 채팅 '들려주기'용)");
  console.log("  3. GitHub repo secrets (영상 파이프라인 나레이션용, video-assembly.yml이 사용)");
}

main().catch((err) => {
  console.error("실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
