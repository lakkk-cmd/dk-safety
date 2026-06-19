// Veo 3.1 텍스트→영상 생성 (Gemini API)
// https://ai.google.dev/api/generate-videos

const VEO_MODEL_DEFAULT = "veo-3.1-generate-preview";
const VEO_DURATION_SECONDS = 8;
// Veo 3.0 fast ~$0.40/sec → 8s = $3.20 (추정치, 실제 청구는 Google 콘솔 확인)
const VEO_COST_PER_SEC_USD = 0.40;
export const VEO_COST_PER_CLIP_USD = VEO_COST_PER_SEC_USD * VEO_DURATION_SECONDS; // $3.20

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_POLL_ATTEMPTS = 60; // 10분 (10s × 60)
const POLL_INTERVAL_MS = 10_000;

export type VeoResult = {
  data: Buffer;
  contentType: string;
  costUsd: number;
  model: string;
};

/**
 * Veo 3.1 텍스트→영상 직접 생성.
 * promptText는 7가지 요소(장면·카메라·조명·분위기·동작·스타일)가 포함된 영어 프롬프트.
 * 비동기 LRO이므로 폴링으로 완료 대기 (최대 10분).
 */
export async function generateSceneVideoFromText(promptText: string): Promise<VeoResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

  const model = process.env.VEO_MODEL?.trim() || VEO_MODEL_DEFAULT;
  const submitUrl = `${GEMINI_API_BASE}/models/${model}:predictLongRunning?key=${apiKey}`;

  const submitBody = {
    instances: [{ prompt: promptText }],
    parameters: {
      aspectRatio: "9:16",
      durationSeconds: VEO_DURATION_SECONDS,
      sampleCount: 1,
    },
  };

  console.log(`  [Veo] ${model} 제출 중...`);
  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submitBody),
    signal: AbortSignal.timeout(30_000),
  });

  const submitRaw = await submitRes.text();
  if (!submitRes.ok) {
    let detail = submitRaw.slice(0, 400);
    try {
      const err = JSON.parse(submitRaw) as { error?: { message?: string } };
      detail = err.error?.message ?? detail;
    } catch { /* keep raw */ }
    throw new Error(`Veo 생성 요청 실패 ${submitRes.status}: ${detail}`);
  }

  const lro = JSON.parse(submitRaw) as { name?: string };
  if (!lro.name) throw new Error(`Veo LRO name 없음. 응답: ${submitRaw.slice(0, 200)}`);
  console.log(`  [Veo] LRO: ${lro.name}`);

  // 폴링 루프
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollUrl = `${GEMINI_API_BASE}/${lro.name}?key=${apiKey}`;
    const pollRes = await fetch(pollUrl, { signal: AbortSignal.timeout(15_000) });
    const pollRaw = await pollRes.text();

    if (!pollRes.ok) {
      console.warn(`  [Veo] 폴링 오류 ${pollRes.status}: ${pollRaw.slice(0, 150)}`);
      continue;
    }

    type VideoEntry = { uri?: string; mimeType?: string; bytesBase64Encoded?: string };
    type VideoSample = { video?: VideoEntry };
    type VeoOpResponse = {
      generateVideoResponse?: { generatedSamples?: VideoSample[] };
      generatedSamples?: VideoSample[];
    };
    const op = JSON.parse(pollRaw) as {
      done?: boolean;
      error?: { message?: string; code?: number };
      response?: VeoOpResponse;
    };

    console.log(`  [Veo] 폴링 ${attempt + 1}/${MAX_POLL_ATTEMPTS}: done=${op.done ?? false}`);

    if (op.error) throw new Error(`Veo 생성 오류: ${op.error.message ?? JSON.stringify(op.error)}`);
    if (!op.done) continue;

    // predictLongRunning 완료 응답: response.generateVideoResponse.generatedSamples
    const video = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video
               ?? op.response?.generatedSamples?.[0]?.video;
    if (!video) throw new Error(`Veo 완료 응답에 비디오 없음. 응답: ${pollRaw.slice(0, 300)}`);

    // 인라인 base64 반환
    if (video.bytesBase64Encoded) {
      const data = Buffer.from(video.bytesBase64Encoded, "base64");
      console.log(`  [Veo] 완료 (인라인). 크기: ${(data.length / 1024 / 1024).toFixed(1)}MB`);
      return { data, contentType: video.mimeType ?? "video/mp4", costUsd: VEO_COST_PER_CLIP_USD, model };
    }

    // URI 다운로드 (URI에 이미 ?alt=media 포함된 경우 &key= 로 붙임)
    if (video.uri) {
      const dlUrl = video.uri.includes("?") ? `${video.uri}&key=${apiKey}` : `${video.uri}?key=${apiKey}&alt=media`;
      console.log(`  [Veo] 다운로드 중: ${video.uri.slice(0, 80)}...`);
      const dlRes = await fetch(dlUrl, { signal: AbortSignal.timeout(120_000) });
      if (!dlRes.ok) {
        const errText = await dlRes.text();
        throw new Error(`Veo 영상 다운로드 실패 ${dlRes.status}: ${errText.slice(0, 200)}`);
      }
      const data = Buffer.from(await dlRes.arrayBuffer());
      console.log(`  [Veo] 다운로드 완료. 크기: ${(data.length / 1024 / 1024).toFixed(1)}MB`);
      return { data, contentType: video.mimeType ?? "video/mp4", costUsd: VEO_COST_PER_CLIP_USD, model };
    }

    throw new Error(`Veo 완료됐으나 URI도 base64도 없음. 응답: ${pollRaw.slice(0, 300)}`);
  }

  throw new Error(`Veo 생성 타임아웃 (${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 60_000}분 초과)`);
}
