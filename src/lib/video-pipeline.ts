// 영상 제작 파이프라인 — 승인된 유튜브 스크립트를 씬으로 분해하고 영상/이미지를 생성
// ai_bg 씬: USE_VEO_VIDEO=true → Veo 3.1 텍스트→영상, false → Flux 정적 이미지
// verdict_card / phone_ui 씬: 기존 node-canvas/satori 그대로 유지

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAgentSupabase } from "@/lib/agent-db";
import { BUSINESS_CONTEXT, callClaudeCustom, callClaudeRich, extractJsonBlock } from "@/lib/agents";
import { KAKAO_MEMO_ENABLED, publishKakaoPost } from "@/lib/kakao-publish";
import { generatePhoneUiBuffer, generateVerdictCardBuffer } from "@/lib/scene-cards";
import { uploadBinaryObject } from "@/lib/supabase-server";
import { generateSceneVideoFromText, VEO_COST_PER_CLIP_USD } from "@/lib/veo-pipeline";

export type SceneType = "ai_bg" | "verdict_card" | "phone_ui";

export type VideoScene = {
  narration: string;
  imagePrompt: string;
  imageUrl?: string;
  sceneType?: SceneType;
  videoUrl?: string; // Veo 3.1 생성 영상 URL (USE_VEO_VIDEO=true인 ai_bg 씬)
};

const MIN_SCENES = 5;
const MAX_SCENES = 8;

// Flux 폴백 이미지 생성 시 텍스트 방지 네거티브 프롬프트
const NEGATIVE_PROMPT_SUFFIX =
  " Negative prompt: no text, no Korean characters, no Chinese characters, no Japanese characters, no signage with text, no readable characters, no captions, no subtitles, no labels, no watermarks, no logos with text.";

// ─── 예산 상수 ────────────────────────────────────────────────────────────────

const BUDGET_KRW = 50_000; // 30일 Veo 사용 한도 (50,000원)
const KRW_PER_USD = 1350;
const BUDGET_USD = BUDGET_KRW / KRW_PER_USD; // ~$37

// ─── 씬 계획 시스템 프롬프트 ──────────────────────────────────────────────────

const SCENE_PLAN_SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 영상 제작 PD이자 Veo 3.1 프롬프트 전문가입니다.
${BUSINESS_CONTEXT}
주어진 유튜브 쇼츠(9:16 세로 영상) 스크립트를 ${MIN_SCENES}~${MAX_SCENES}개의 씬으로 분해하라.

각 씬은 다음 필드를 가진다:
- narration: 한국어, 1~2문장. 모든 씬의 narration을 순서대로 이어 읽으면 스크립트 전체 내용을 커버해야 한다.
- sceneType: 반드시 다음 중 하나:
    • "ai_bg"       — Veo 3.1 AI가 생성할 한국 아파트 전기설비 현장 영상
    • "verdict_card" — 점검 결과/판정을 카드 형태로 보여줄 씬 (예: "안전합니다", "누전 위험 감지")
    • "phone_ui"    — 앱/웹 예약 화면을 폰 화면으로 보여줄 씬
- imagePrompt: sceneType이 "ai_bg"인 경우만 **영어**로 작성. Veo 3.1 텍스트→영상 생성용이므로 아래 7가지 요소를 모두 포함한 2~4문장:
    1. Scene description: 인물·사물·배경의 구체적 묘사 (한국 아파트 내 전기설비 현장)
    2. Camera angle: (예: low-angle shot, close-up, wide establishing shot, over-the-shoulder)
    3. Camera movement: (예: slow zoom-in, static shot, gentle pan left to right, slight dolly-in)
    4. Lighting: (예: warm indoor fluorescent lighting, natural daylight through window, focused work-light)
    5. Mood/atmosphere: (예: professional and reassuring, tense and urgent, calm and informative)
    6. Action/motion: 씬 안에서 정확히 무슨 동작이 일어나는지 시간 흐름 순서대로 구체적으로
    7. Visual style: "photorealistic documentary style, no readable text, no Korean characters, no signage with text, no subtitles"
    프롬프트는 독립적으로 완결 (이전 씬 참조 없이 단독으로 이해 가능). 8초 분량 기준.
  sceneType이 "verdict_card" 또는 "phone_ui"인 경우 빈 문자열("") 로 설정.

판정 카드나 앱 화면이 필요한 씬에는 절대 "ai_bg"를 사용하지 마라.

JSON 형식으로만 응답하라:
\`\`\`json
{
  "scenes": [
    { "narration": "...", "sceneType": "ai_bg", "imagePrompt": "A licensed electrician in work uniform crouches in front of an open breaker panel inside a Korean apartment utility closet. Close-up shot with slight upward angle. Camera slowly zooms in toward the breaker switches. Warm fluorescent lighting illuminates the panel from above. Professional and methodical mood. The electrician carefully examines each breaker switch one by one, pointing with a non-contact voltage tester. Photorealistic documentary style, no readable text, no Korean characters, no signage with text, no subtitles." },
    { "narration": "...", "sceneType": "verdict_card", "imagePrompt": "" }
  ]
}
\`\`\``;

/** 스크립트를 9:16 쇼츠용 씬 5~8개로 분해 (Veo 프롬프트 포함) */
export async function planVideoScenes(title: string, script: string): Promise<VideoScene[]> {
  const prompt = `영상 제목: ${title}\n\n[스크립트]\n${script}\n\n위 스크립트를 씬으로 분해하라.`.trim();
  const raw = await callClaudeCustom(SCENE_PLAN_SYSTEM_PROMPT, prompt, 4000, 120_000);
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

// ─── Flux 이미지 생성 (Veo 폴백 전용) ──────────────────────────────────────────

const DEFAULT_IMAGE_MODEL = "black-forest-labs/flux.2-pro";
const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function imageExtensionFor(contentType: string): string {
  return CONTENT_TYPE_EXT[contentType] ?? "png";
}

/** OpenRouter Flux로 씬 이미지 생성 (Veo 폴백 또는 USE_VEO_VIDEO=false 경로) */
export async function generateSceneImage(prompt: string): Promise<{ data: Buffer; contentType: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY가 설정되지 않았습니다.");

  const model = process.env.OPENROUTER_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const fullPrompt = `${prompt}${NEGATIVE_PROMPT_SUFFIX}`;

  const MAX_FLUX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_FLUX_RETRIES; attempt++) {
    if (attempt > 0) {
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

// ─── OCR 게이트 (Flux 경로 전용) ─────────────────────────────────────────────

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
    return false;
  }
}

// ─── 실패 알림 ────────────────────────────────────────────────────────────────

export async function notifyOcrFailure(queueId: string, sceneIndex: number, prompt: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const message = `[영상 이미지 OCR 실패] 씬 ${sceneIndex + 1}\n큐ID: ${queueId}\n프롬프트: ${prompt.slice(0, 100)}`;

  await supabase.from("boss_feedback").insert({
    content: message,
    status: "pending",
  }).throwOnError();

  if (KAKAO_MEMO_ENABLED) {
    await publishKakaoPost("⚠️ 영상 씬 이미지 OCR 실패", message).catch(() => undefined);
  }
}

// ─── Gemini 비용 로그 + 예산 가드 ─────────────────────────────────────────────

async function logGeminiUsage(
  supabase: SupabaseClient,
  operation: "veo_video" | "veo_video_fallback",
  queueId: string,
  sceneIndex: number,
  costUsd: number,
  success: boolean,
): Promise<void> {
  const model = process.env.VEO_MODEL?.trim() || "veo-3.1-generate-preview";
  try {
    await supabase.from("gemini_usage_log").insert({
      model,
      operation,
      queue_id: queueId,
      scene_index: sceneIndex,
      cost_usd: costUsd,
      success,
    });
  } catch (err) {
    console.error("[gemini_usage_log] 로그 기록 실패:", err);
  }
}

async function checkGeminiBudget(supabase: SupabaseClient): Promise<void> {
  const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("gemini_usage_log")
    .select("cost_usd")
    .eq("success", true)
    .gte("created_at", sinceDate);

  const totalUsd = (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd), 0);
  const totalKrw = Math.round(totalUsd * KRW_PER_USD);
  console.log(`[예산 체크] 최근 30일 Veo 사용: $${totalUsd.toFixed(2)} (${totalKrw.toLocaleString()}원) / 한도 ${BUDGET_KRW.toLocaleString()}원`);

  if (totalUsd >= BUDGET_USD) {
    const message = `[Gemini(Veo) 예산 한도 초과]\n최근 30일: $${totalUsd.toFixed(2)} (${totalKrw.toLocaleString()}원)\n한도: ${BUDGET_KRW.toLocaleString()}원\nVeo 영상 생성이 중단되었습니다.`;
    if (KAKAO_MEMO_ENABLED) {
      await publishKakaoPost("⚠️ Veo API 예산 한도 초과", message).catch(console.error);
    }
    throw new Error(`Gemini 예산 한도 초과: $${totalUsd.toFixed(2)} / $${BUDGET_USD.toFixed(2)} (30일 기준)`);
  }
}

// ─── Flux ai_bg 씬 처리 (Veo 비활성 또는 폴백) ───────────────────────────────

async function produceAiBgSceneFlux(
  scene: VideoScene,
  queueId: string,
  sceneIndex: number,
  bucket: string,
): Promise<{ imageUrl: string }> {
  let generated: { data: Buffer; contentType: string } | null = null;
  let hasText = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    const seedSuffix = attempt > 0 ? ` (variation ${attempt + 1}, avoid all text)` : "";
    const { data, contentType: ct } = await generateSceneImage(scene.imagePrompt + seedSuffix);
    generated = { data, contentType: ct };

    const tmpPath = `scenes/ocr-check/${queueId}/${sceneIndex}_attempt${attempt}.${imageExtensionFor(ct)}`;
    const tmpUrl = await uploadBinaryObject({ bucket, objectPath: tmpPath, contentType: ct, data });
    hasText = await detectTextInImage(tmpUrl);
    console.log(`  OCR attempt ${attempt + 1}: hasText=${hasText}`);

    if (!hasText) break;
  }

  if (hasText) {
    console.warn(`  씬 ${sceneIndex + 1} OCR 3회 실패 → boss_feedback 알림`);
    await notifyOcrFailure(queueId, sceneIndex, scene.imagePrompt).catch(console.error);
  }

  const ext = imageExtensionFor(generated!.contentType);
  const imageUrl = await uploadBinaryObject({
    bucket,
    objectPath: `scenes/${queueId}/${sceneIndex}.${ext}`,
    contentType: generated!.contentType,
    data: generated!.data,
  });
  return { imageUrl };
}

// ─── 전체 자산 생성 ───────────────────────────────────────────────────────────

export type ProduceVideoAssetsResult = { scenes: VideoScene[] };

/** 승인된 유튜브 큐 항목의 스크립트를 씬으로 분해하고 Veo(또는 Flux) 자산을 생성 */
export async function produceVideoAssets(queueId: string): Promise<ProduceVideoAssetsResult> {
  const supabase = requireAgentSupabase();
  const USE_VEO = process.env.USE_VEO_VIDEO === "true";

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

    // 예상 비용 출력
    const aiBgCount = planned.filter((s) => (s.sceneType ?? "ai_bg") === "ai_bg").length;
    if (USE_VEO) {
      const estUsd = aiBgCount * VEO_COST_PER_CLIP_USD;
      console.log(
        `[비용 예측] ai_bg 씬 ${aiBgCount}개 × $${VEO_COST_PER_CLIP_USD.toFixed(2)}/씬 (Veo 3.1) = $${estUsd.toFixed(2)} (≈ ${Math.round(estUsd * KRW_PER_USD).toLocaleString()}원)`,
      );
      await checkGeminiBudget(supabase);
    } else {
      console.log(`[모드] USE_VEO_VIDEO=false — Flux 정적 이미지 생성 (Veo 비용 없음)`);
    }

    const scenes: VideoScene[] = [];

    for (let i = 0; i < planned.length; i++) {
      const scene = planned[i];
      const type = scene.sceneType ?? "ai_bg";
      console.log(`[씬 ${i + 1}/${planned.length}] type=${type}`);

      // ── ai_bg + Veo 모드 ──────────────────────────────────────────────────
      if (type === "ai_bg" && USE_VEO) {
        try {
          console.log(`  [Veo] 프롬프트: ${scene.imagePrompt.slice(0, 150)}...`);
          const veoResult = await generateSceneVideoFromText(scene.imagePrompt);
          const videoUrl = await uploadBinaryObject({
            bucket,
            objectPath: `scenes/${queueId}/${i}.mp4`,
            contentType: "video/mp4",
            data: veoResult.data,
          });
          await logGeminiUsage(supabase, "veo_video", queueId, i, veoResult.costUsd, true);
          console.log(`  [Veo] 씬 ${i + 1} 완료: ${videoUrl}`);
          scenes.push({ ...scene, videoUrl });
        } catch (err) {
          console.error(`  [Veo] 씬 ${i + 1} 실패 → Flux 폴백:`, err);
          await logGeminiUsage(supabase, "veo_video_fallback", queueId, i, 0, false).catch(() => undefined);
          const { imageUrl } = await produceAiBgSceneFlux(scene, queueId, i, bucket);
          scenes.push({ ...scene, imageUrl });
        }
        continue;
      }

      // ── verdict_card ──────────────────────────────────────────────────────
      if (type === "verdict_card") {
        const data = await generateVerdictCardBuffer(scene.narration);
        console.log(`  판정 카드 생성 완료`);
        const imageUrl = await uploadBinaryObject({
          bucket,
          objectPath: `scenes/${queueId}/${i}.png`,
          contentType: "image/png",
          data,
        });
        scenes.push({ ...scene, imageUrl });
        continue;
      }

      // ── phone_ui ──────────────────────────────────────────────────────────
      if (type === "phone_ui") {
        const data = await generatePhoneUiBuffer(scene.narration);
        console.log(`  폰 UI 생성 완료`);
        const imageUrl = await uploadBinaryObject({
          bucket,
          objectPath: `scenes/${queueId}/${i}.png`,
          contentType: "image/png",
          data,
        });
        scenes.push({ ...scene, imageUrl });
        continue;
      }

      // ── ai_bg + Flux (USE_VEO_VIDEO=false) ────────────────────────────────
      const { imageUrl } = await produceAiBgSceneFlux(scene, queueId, i, bucket);
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
