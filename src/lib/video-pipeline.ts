// 영상 제작 파이프라인 — 승인된 유튜브 스크립트를 씬으로 분해하고 이미지를 생성
// 씬 종류: ai_bg (Flux 생성 + OCR 게이트), verdict_card (판정 카드), phone_ui (폰 UI 미리보기)

import { requireAgentSupabase } from "@/lib/agent-db";
import { BUSINESS_CONTEXT, callClaudeCustom, callClaudeRich, extractJsonBlock } from "@/lib/agents";
import { KAKAO_MEMO_ENABLED, publishKakaoPost } from "@/lib/kakao-publish";
import { generatePhoneUiBuffer, generateVerdictCardBuffer } from "@/lib/scene-cards";
import { uploadBinaryObject } from "@/lib/supabase-server";

export type SceneType = "ai_bg" | "verdict_card" | "phone_ui";

export type VideoScene = {
  narration: string;
  imagePrompt: string;
  imageUrl?: string;
  sceneType?: SceneType;
};

const MIN_SCENES = 5;
const MAX_SCENES = 8;

// AI 이미지 생성 시 텍스트/문자 출력 방지 네거티브 프롬프트
const NEGATIVE_PROMPT_SUFFIX =
  " Negative prompt: no text, no Korean characters, no Chinese characters, no Japanese characters, no signage with text, no readable characters, no captions, no subtitles, no labels, no watermarks, no logos with text.";

const SCENE_PLAN_SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 영상 제작 PD입니다.
${BUSINESS_CONTEXT}
주어진 유튜브 쇼츠(9:16 세로 영상) 스크립트를 ${MIN_SCENES}~${MAX_SCENES}개의 씬으로 분해하라.

각 씬은 다음 필드를 가진다:
- narration: 한국어, 1~2문장. 모든 씬의 narration을 순서대로 이어 읽으면 스크립트 전체 내용을 커버해야 한다.
- sceneType: 반드시 다음 중 하나:
    • "ai_bg"       — 아파트/현장 배경 사진 또는 일러스트 (기사가 작업하는 장면, 분전반, 콘센트 등)
    • "verdict_card" — 점검 결과/판정을 카드 형태로 보여줄 씬 (예: "안전합니다", "누전 위험 감지")
    • "phone_ui"    — 앱/웹 예약 화면을 폰 화면으로 보여줄 씬
- imagePrompt: sceneType이 "ai_bg"인 경우만 영어로 작성. 세로(9:16) 구도, 한국 아파트 전기설비, 사실적 또는 플랫 일러스트 스타일.
  sceneType이 "verdict_card" 또는 "phone_ui"인 경우 빈 문자열("") 로 설정.

판정 카드나 앱 화면이 필요한 씬은 반드시 해당 sceneType을 사용하라. 텍스트/한국어가 포함된 이미지가 필요한 씬에는 절대 "ai_bg"를 사용하지 마라.

JSON 형식으로만 응답하라:
\`\`\`json
{
  "scenes": [
    { "narration": "...", "sceneType": "ai_bg", "imagePrompt": "..." },
    { "narration": "...", "sceneType": "verdict_card", "imagePrompt": "" }
  ]
}
\`\`\``;

/** 스크립트를 9:16 쇼츠용 씬 5~8개로 분해 */
export async function planVideoScenes(title: string, script: string): Promise<VideoScene[]> {
  const prompt = `영상 제목: ${title}\n\n[스크립트]\n${script}\n\n위 스크립트를 씬으로 분해하라.`.trim();
  const raw = await callClaudeCustom(SCENE_PLAN_SYSTEM_PROMPT, prompt, 3000, 120_000);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) throw new Error("씬 분해 응답에서 JSON을 파싱할 수 없습니다.");

  const parsed = JSON.parse(jsonText) as { scenes?: Partial<VideoScene>[] };
  const scenes = (parsed.scenes ?? [])
    .map((s) => ({
      narration: String(s.narration ?? "").trim(),
      imagePrompt: String(s.imagePrompt ?? "").trim(),
      sceneType: (s.sceneType ?? "ai_bg") as SceneType,
    }))
    .filter((s) => s.narration)
    .slice(0, MAX_SCENES);

  if (scenes.length === 0) throw new Error("씬 분해 결과가 비어 있습니다.");
  return scenes;
}

// ─── AI 이미지 생성 (Flux) ─────────────────────────────────────────────────────

const DEFAULT_IMAGE_MODEL = "black-forest-labs/flux.2-pro";
const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function imageExtensionFor(contentType: string): string {
  return CONTENT_TYPE_EXT[contentType] ?? "png";
}

/** OpenRouter Flux로 씬 이미지 생성 (네거티브 프롬프트 자동 추가) */
export async function generateSceneImage(prompt: string): Promise<{ data: Buffer; contentType: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY가 설정되지 않았습니다.");

  const model = process.env.OPENROUTER_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const fullPrompt = `${prompt}${NEGATIVE_PROMPT_SUFFIX}`;

  const MAX_FLUX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_FLUX_RETRIES; attempt++) {
    if (attempt > 0) {
      // 레이트 리밋 회피: 지수 백오프 (3s, 6s)
      await new Promise<void>((r) => setTimeout(r, 3000 * attempt));
      console.log(`  Flux 재시도 ${attempt + 1}/${MAX_FLUX_RETRIES}...`);
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: fullPrompt }],
        modalities: ["image"],
        image_config: { aspect_ratio: "9:16", image_size: "1K" },
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const raw = await res.text();
    if (!res.ok) {
      let detail = raw.slice(0, 300);
      try { const err = JSON.parse(raw) as { error?: { message?: string } }; detail = err.error?.message ?? detail; } catch { /* keep raw */ }
      lastError = new Error(`OpenRouter 이미지 생성 ${res.status}: ${detail}`);
      continue;
    }

    const json = JSON.parse(raw) as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[] };
    const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) {
      lastError = new Error("OpenRouter 응답에 이미지가 없습니다.");
      continue;
    }

    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("OpenRouter 이미지 응답 형식을 인식할 수 없습니다.");
    return { data: Buffer.from(match[2], "base64"), contentType: match[1] };
  }

  throw lastError ?? new Error("Flux 이미지 생성 실패 (알 수 없는 오류)");
}

// ─── OCR 게이트 (Claude Vision) ───────────────────────────────────────────────

/**
 * Claude Vision으로 이미지에 한국어/한자/읽을 수 있는 텍스트가 있는지 확인.
 * 텍스트 감지 시 true 반환 → 이미지 재생성 필요.
 */
export async function detectTextInImage(imageUrl: string): Promise<boolean> {
  try {
    const reply = await callClaudeRich({
      systemPrompt: "당신은 이미지 분석 전문가입니다. 간결하게 YES/NO만 답하세요.",
      userContent: [
        { type: "image", source: { type: "url", url: imageUrl } },
        {
          type: "text",
          text: "이 이미지에 한국어, 한자, 일본어, 또는 기타 읽을 수 있는 텍스트/문자가 포함되어 있나요? YES 또는 NO 하나만 답하세요.",
        },
      ],
      maxTokens: 10,
      timeoutMs: 15_000,
    });
    return reply.trim().toUpperCase().startsWith("YES");
  } catch {
    return false; // OCR 실패 시 통과 처리
  }
}

// ─── 실패 알림 ────────────────────────────────────────────────────────────────

export async function notifyOcrFailure(queueId: string, sceneIndex: number, prompt: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const message = `[영상 이미지 OCR 실패] 씬 ${sceneIndex + 1}\n큐ID: ${queueId}\n프롬프트: ${prompt.slice(0, 100)}`;

  // boss_feedback 기록
  await supabase.from("boss_feedback").insert({
    content: message,
    status: "pending",
  }).throwOnError();

  // Kakao 알림 (연동된 경우)
  if (KAKAO_MEMO_ENABLED) {
    await publishKakaoPost("⚠️ 영상 씬 이미지 OCR 실패", message).catch(() => undefined);
  }
}

// ─── 전체 자산 생성 ───────────────────────────────────────────────────────────

export type ProduceVideoAssetsResult = { scenes: VideoScene[] };

/** 승인된 유튜브 큐 항목의 스크립트를 씬으로 분해하고 각 씬 이미지를 생성 */
export async function produceVideoAssets(queueId: string): Promise<ProduceVideoAssetsResult> {
  const supabase = requireAgentSupabase();

  const { data: row, error } = await supabase
    .from("content_youtube_queue")
    .select("id, title, script, status")
    .eq("id", queueId)
    .single();
  if (error || !row) throw error ?? new Error("유튜브 큐 항목을 찾을 수 없습니다.");
  if (row.status !== "approved") throw new Error(`영상 제작은 approved 항목만 가능. 현재: ${row.status}`);
  if (!row.script) throw new Error("스크립트가 없는 항목입니다.");

  await supabase
    .from("content_youtube_queue")
    .update({ status: "producing", updated_at: new Date().toISOString() })
    .eq("id", queueId);

  try {
    const planned = await planVideoScenes(row.title, row.script);
    const bucket = process.env.SUPABASE_VIDEO_BUCKET?.trim() || "dk-safety-video-assets";
    const scenes: VideoScene[] = [];

    for (let i = 0; i < planned.length; i++) {
      const scene = planned[i];
      const type = scene.sceneType ?? "ai_bg";
      console.log(`[씬 ${i + 1}/${planned.length}] type=${type}`);

      let imageData: Buffer;
      let contentType = "image/png";

      if (type === "verdict_card") {
        // 판정 카드: 코드로 생성, OCR 불필요
        imageData = await generateVerdictCardBuffer(scene.narration);
        console.log(`  판정 카드 생성 완료`);
      } else if (type === "phone_ui") {
        // 폰 UI: 코드로 생성, OCR 불필요
        imageData = await generatePhoneUiBuffer(scene.narration);
        console.log(`  폰 UI 생성 완료`);
      } else {
        // ai_bg: Flux 생성 + OCR 게이트 (최대 3회)
        let generated: { data: Buffer; contentType: string } | null = null;
        let hasText = false;

        for (let attempt = 0; attempt < 3; attempt++) {
          const seedSuffix = attempt > 0 ? ` (variation ${attempt + 1}, avoid all text)` : "";
          const { data, contentType: ct } = await generateSceneImage(scene.imagePrompt + seedSuffix);
          generated = { data, contentType: ct };

          // Supabase에 임시 업로드해 Claude Vision URL로 확인
          const tmpPath = `scenes/ocr-check/${queueId}/${i}_attempt${attempt}.${imageExtensionFor(ct)}`;
          const tmpUrl = await uploadBinaryObject({ bucket, objectPath: tmpPath, contentType: ct, data });
          hasText = await detectTextInImage(tmpUrl);
          console.log(`  OCR attempt ${attempt + 1}: hasText=${hasText}`);

          if (!hasText) break;
        }

        if (hasText) {
          // 3회 모두 텍스트 감지 → 알림 + 마지막 이미지 그대로 사용
          console.warn(`  씬 ${i + 1} OCR 3회 실패 → boss_feedback 알림`);
          await notifyOcrFailure(queueId, i, scene.imagePrompt).catch(console.error);
        }

        imageData = generated!.data;
        contentType = generated!.contentType;
      }

      const ext = imageExtensionFor(contentType);
      const imageUrl = await uploadBinaryObject({
        bucket,
        objectPath: `scenes/${queueId}/${i}.${ext}`,
        contentType,
        data: imageData,
      });
      scenes.push({ ...scene, imageUrl });
    }

    await supabase
      .from("content_youtube_queue")
      .update({ scenes, status: "assets_ready", updated_at: new Date().toISOString() })
      .eq("id", queueId);

    return { scenes };
  } catch (err) {
    await supabase
      .from("content_youtube_queue")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", queueId);
    throw err;
  }
}
