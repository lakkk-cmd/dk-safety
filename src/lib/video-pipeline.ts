// 영상 제작 파이프라인 — 승인된 유튜브 스크립트를 씬으로 분해하고 영상/이미지를 생성
// ai_bg 씬: USE_VEO_VIDEO=true → Veo 3.1 텍스트→영상, false → Flux 정적 이미지
// verdict_card / phone_ui 씬: 기존 node-canvas/satori 그대로 유지

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAgentSupabase } from "@/lib/agent-db";
import { BUSINESS_CONTEXT, callClaudeCustom, callClaudeRich, extractJsonBlock } from "@/lib/agents";
import { dispatchGithubWorkflow } from "@/lib/github-issues";
import { KAKAO_MEMO_ENABLED, publishKakaoPost } from "@/lib/kakao-publish";
import { listAvailablePhotoTags, pickLibraryPhotoForTag } from "@/lib/media-library";
import { generatePhoneUiBuffer, generateVerdictCardBuffer } from "@/lib/scene-cards";
import { uploadBinaryObject } from "@/lib/supabase-server";
import { submitVeoLro, VEO_COST_PER_CLIP_USD } from "@/lib/veo-pipeline";

export type SceneType = "ai_bg" | "verdict_card" | "phone_ui" | "real_photo";

export type VideoScene = {
  narration: string;
  imagePrompt: string;
  imageUrl?: string;
  sceneType?: SceneType;
  videoUrl?: string;
  // 시네마틱 메타데이터 (업그레이드된 SCENE_PLAN_SYSTEM_PROMPT 출력)
  emotionTone?: string;     // 긴장|경고|설명|안심|CTA
  connectionNote?: string;  // 직전 씬과의 연결 메모 (Flow용)
  koreanSummary?: string;   // 대장 한 줄 요약
  photoTag?: string;        // 미디어 보관함의 실제 사진 태그와 일치하면 Flux 대신 그 사진 사용
};

export type ScenePlanResult = {
  scenes: VideoScene[];
  contiSummary: string;   // 전체 콘티 요약 (감정곡선 + 영화적 장치)
  visualMotif?: string;   // 반복 시각 모티프
};

const MIN_SCENES = 5;
const MAX_SCENES = 8;

// Flux 폴백 이미지 생성 시 텍스트 방지 네거티브 프롬프트
// 2026-07-13: 포토리얼리즘 강제를 해제 — 마스터 캐릭터(마스코트) 일관성 기법을 쓰기 위해
// 플랫 일러스트 스타일을 허용한다. 텍스트/워터마크 방지 가드는 스타일과 무관하게 유지.
const NEGATIVE_PROMPT_SUFFIX =
  " Negative prompt: no text, no Korean characters, no Chinese characters, no Japanese characters, no signage with text, no readable characters, no captions, no subtitles, no labels, no watermarks, no logos with text, no gibberish text, no fake English text, no nonsense letters on screens or dials or buttons.";

// ─── 예산 상수 ────────────────────────────────────────────────────────────────

const BUDGET_KRW = 50_000; // 30일 Veo 사용 한도 (50,000원)
const KRW_PER_USD = 1350;
const BUDGET_USD = BUDGET_KRW / KRW_PER_USD; // ~$37

// ─── 씬 계획 시스템 프롬프트 (전문 영상 감독 수준) ──────────────────────────

const SCENE_PLAN_SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 수석 영상 감독(DOP)이자 Veo 3.1 프롬프트 아키텍트입니다.
${BUSINESS_CONTEXT}

## 임무
주어진 유튜브 쇼츠(9:16 세로, ${MIN_SCENES}~${MAX_SCENES}씬) 스크립트를 "이어진 하나의 단편 영화"로 설계한다.
시청자가 "정보 영상을 봤다"가 아니라 "짧은 이야기를 봤다"고 느끼도록.

---

## 작업 순서

### 1단계: 스크립트 분석 + 콘티 설계 (먼저 머릿속에서 완성)
- 감정 곡선 파악: 긴장↑ / 설명 / 경고 / 안심 / CTA 구간 특정
- 오프닝 훅 설계: 첫 씬은 답을 주지 않고 질문/긴장 먼저 (결과 → 원인 순 "미스터리 구조")
- 반복 시각 모티프 1개 선정 (예: 빨간 작업복, 깜빡이는 조명, 기술자의 손)
- 클로징 콜백 설계: 마지막 씬은 오프닝과 같은 구도를 "해결된 버전"으로
- 카메라 리듬: 긴장 구간=빠른 컷·빠른 움직임 / 설명 구간=안정적 고정샷

### 2단계: 씬 분해
sceneType 결정:
- "ai_bg": Veo 3.1이 생성할 한국 아파트 전기설비 현장 영상
- "verdict_card": 측정값·판정 결과를 카드로 보여주는 씬 (텍스트 오버레이로 별도 합성)
- "phone_ui": dkansim.com 예약 화면을 폰 UI로 보여주는 씬 (별도 합성)

{{AVAILABLE_PHOTO_TAGS_SECTION}}

### 3단계: ai_bg 씬마다 Veo 프롬프트 작성
7가지 요소를 모두 포함한 영어 프롬프트 (2~4문장, 8초 분량):
1. **Scene description**: 인물·사물·배경 구체 묘사 (한국 아파트 내부)
   → 인물 등장 씬은 매번 동일 외모/복장을 명시 (Veo는 씬 간 기억 없음: "Korean male electrician in his 40s, wearing red safety vest and white hard hat")
   → 같은 공간(분전함 앞 등)이 반복되면 배경 묘사 일관 유지
2. **Camera angle**: 감정과 일치 (설명=eye-level, 위험=low angle, 디테일=extreme close-up)
3. **Camera movement**: 감정 반영 (긴장=fast zoom-in, 안심=slow pan, 설명=static hold)
4. **Lighting**: 색온도로 감정 표현 (안심=warm 3200K fluorescent, 경고=cold harsh light, 설명=neutral)
5. **Mood/atmosphere**: 감정 톤 명시 (tense/urgent, reassuring/professional, calm/informative 등)
6. **Action/motion**: 씬 내 동작을 시간 순서대로. 복잡한 손동작 금지 — Veo 취약점.
   수치/텍스트 표시가 필요한 정보는 프롬프트에 넣지 말고 "text overlay will be composited separately" 로 메모.
   측정기·계기판·버튼처럼 화면/라벨이 있는 소품이 등장하면, 반드시 "device screen is angled away from camera / motion-blurred / out of focus, no legible display or button labels"를 프롬프트에 명시해 Flux가 화면에 가짜 글자를 그리지 않게 한다.
7. **Visual style**: 반드시 마지막에 → "Clean flat illustration style, simple bold outlines, limited flat color palette (navy/gold brand accent), friendly and approachable character design, 9:16 vertical, no readable text, no Korean characters, no signage, no subtitles. Consistent with the established mascot character design — same proportions, outfit, and palette in every scene."
마지막에 Continuity 메모 추가: "Continuity: [인물/공간 일관성 메모]"

---

## 5가지 영화적 장치 (반드시 적용)
1. **오프닝 미스터리**: 씬1은 결과/긴장 상황 먼저 — 원인/해결은 이후
2. **반복 시각 모티프**: 선정한 모티프가 여러 씬에 자연스럽게 등장
3. **컷 리듬 다양성**: 긴장=빠른 컷(짧은 씬), 설명=안정적(긴 씬). 같은 앵글 3개 이상 연속 금지
4. **클로징 시각 콜백**: 마지막 씬 = 오프닝 씬 구도의 "해결된 버전"
5. **3단 정보 구성**: 정보 씬은 wide establishing → close-up on detail → medium reaction 순

---

## Veo 3.1 특성
- 강점: 자연스러운 인물 움직임, 사실적 조명/질감, 카메라 모션
- 약점: 텍스트·숫자 표시, 복잡한 다중 손동작, 정밀 계기판 조작
  → 이런 정보는 verdict_card/phone_ui sceneType 또는 "text overlay composited separately" 메모로 처리

---

## 출력 형식 (JSON만, 설명 없이)
\`\`\`json
{
  "contiSummary": "전체 콘티 요약 2~3문단: 감정 곡선(텍스트 그래프), 5가지 영화적 장치 적용 방법, 반복 모티프 설명",
  "visualMotif": "선정한 반복 시각 모티프 한 줄 (예: '빨간 작업복 + 계량기 측정기')",
  "scenes": [
    {
      "narration": "한국어 1~2문장 (모든 씬 이어 읽으면 스크립트 전체 커버)",
      "sceneType": "ai_bg",
      "emotionTone": "긴장|경고|설명|안심|CTA 중 하나",
      "connectionNote": "직전 씬과 시공간·감정 연결 메모 (씬1은 '오프닝 — 미스터리 훅')",
      "imagePrompt": "7요소 포함 영어 프롬프트. Continuity: [인물/공간 일관성 메모]",
      "koreanSummary": "대장이 이 씬을 한 줄로 이해할 수 있는 설명",
      "photoTag": "이 씬 내용이 '사용 가능한 실제 사진 태그' 목록 중 하나와 일치하면 그 태그 문자열, 아니면 생략"
    },
    {
      "narration": "...",
      "sceneType": "verdict_card",
      "emotionTone": "안심",
      "connectionNote": "측정 결과를 텍스트 카드로 전환 — 이전 ai_bg 씬에서 측정 완료 후",
      "imagePrompt": "",
      "koreanSummary": "판정 결과 카드 씬"
    }
  ]
}
\`\`\``;

/** 스크립트를 9:16 쇼츠용 씬 5~8개로 분해 (시네마틱 콘티 + Veo 프롬프트 포함) */
export async function planVideoScenes(title: string, script: string): Promise<ScenePlanResult> {
  const availableTags = await listAvailablePhotoTags().catch(() => []);
  const tagsSection = availableTags.length > 0
    ? `사용 가능한 실제 사진 태그 (분전함 등 사장님이 직접 등록한 현장 사진): ${availableTags.join(", ")}\n` +
      `씬 내용이 이 태그 중 하나와 명확히 맞으면 그 씬의 "photoTag"에 해당 태그를 넣어라 (AI 생성 대신 실제 사진을 사용한다). 애매하면 생략.`
    : "현재 등록된 실제 사진 태그가 없음 — photoTag는 모두 생략.";
  const systemPrompt = SCENE_PLAN_SYSTEM_PROMPT.replace("{{AVAILABLE_PHOTO_TAGS_SECTION}}", tagsSection);

  const prompt = `영상 제목: ${title}\n\n[스크립트]\n${script}\n\n위 스크립트를 단편 영화처럼 씬으로 분해하라.`.trim();
  const raw = await callClaudeCustom(systemPrompt, prompt, 8000, 120_000);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) throw new Error("씬 분해 응답에서 JSON을 파싱할 수 없습니다.");

  const parsed = JSON.parse(jsonText) as {
    scenes?: Partial<VideoScene>[];
    contiSummary?: string;
    visualMotif?: string;
  };

  const availableTagSet = new Set(availableTags);
  const scenes = (parsed.scenes ?? [])
    .map((s) => ({
      narration: String(s.narration ?? "").trim(),
      imagePrompt: String(s.imagePrompt ?? "").trim(),
      sceneType: (s.sceneType ?? "ai_bg") as SceneType,
      emotionTone: s.emotionTone ? String(s.emotionTone).trim() : undefined,
      connectionNote: s.connectionNote ? String(s.connectionNote).trim() : undefined,
      koreanSummary: s.koreanSummary ? String(s.koreanSummary).trim() : undefined,
      photoTag: s.photoTag && availableTagSet.has(String(s.photoTag).trim()) ? String(s.photoTag).trim() : undefined,
    }))
    .filter((s) => s.narration)
    .slice(0, MAX_SCENES);

  if (scenes.length === 0) throw new Error("씬 분해 결과가 비어 있습니다.");

  return {
    scenes,
    contiSummary: String(parsed.contiSummary ?? "").trim(),
    visualMotif: parsed.visualMotif ? String(parsed.visualMotif).trim() : undefined,
  };
}

/** 미디어 보관함에 이 태그로 등록해두면(현장 실사진 1장 권장) ai_bg 씬 전체가 그 얼굴/복장을
 *  참조 이미지로 공유해 인물 일관성이 올라간다. 등록 안 돼 있으면 undefined — 기존처럼 프롬프트
 *  텍스트만으로 일관성을 유지하는 방식 그대로 동작(하위 호환). */
export const MASTER_CHARACTER_TAG = "master_character";

async function resolveMasterCharacterReference(): Promise<string | undefined> {
  const photo = await pickLibraryPhotoForTag(MASTER_CHARACTER_TAG).catch(() => null);
  return photo?.url;
}

/** photoTag가 붙은 씬을 실제 등록 사진으로 치환 (Flux/Veo 생성 스킵) — 재고가 없으면 그대로 둠(ai_bg 유지) */
async function resolveRealPhotoScenes(scenes: VideoScene[]): Promise<VideoScene[]> {
  const resolved: VideoScene[] = [];
  for (const scene of scenes) {
    if (scene.photoTag) {
      const photo = await pickLibraryPhotoForTag(scene.photoTag).catch(() => null);
      if (photo) {
        resolved.push({ ...scene, sceneType: "real_photo", imageUrl: photo.url });
        continue;
      }
    }
    resolved.push(scene);
  }
  return resolved;
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

/** OpenRouter Flux로 씬 이미지 생성 (Veo 폴백 또는 USE_VEO_VIDEO=false 경로)
 *  referenceImageUrl을 주면 해당 이미지를 편집 기준(이미지-투-이미지)으로 사용해 인물/스타일
 *  일관성을 높인다 — flux.2-pro가 image editing을 지원함을 실제 호출로 확인함(2026-07-13). */
export async function generateSceneImage(
  prompt: string,
  referenceImageUrl?: string,
): Promise<{ data: Buffer; contentType: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY가 설정되지 않았습니다.");

  const model = process.env.OPENROUTER_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const fullPrompt = `${prompt}${NEGATIVE_PROMPT_SUFFIX}`;
  const content = referenceImageUrl
    ? [{ type: "image_url", image_url: { url: referenceImageUrl } }, { type: "text", text: fullPrompt }]
    : fullPrompt;

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
        messages: [{ role: "user", content }],
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
          text:
            "이 이미지에 다음 중 하나라도 있나요?\n" +
            "1. 한국어, 한자, 일본어 등 읽을 수 있는 문자\n" +
            "2. 계기판 화면·버튼·다이얼·라벨 등에 있는 의미 없는 가짜 영어 글자(예: 실제 단어가 아닌 철자, 깨진 브랜드명 같은 것)\n" +
            "3. 기타 읽을 수 있거나 읽으려고 시도하게 되는 모든 문자/숫자 표시\n" +
            "위 셋 중 하나라도 있으면 YES, 전혀 없으면 NO 하나만 답하세요.",
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

export async function produceAiBgSceneFlux(
  scene: VideoScene,
  queueId: string,
  sceneIndex: number,
  bucket: string,
  referenceImageUrl?: string,
): Promise<{ imageUrl: string }> {
  let generated: { data: Buffer; contentType: string } | null = null;
  let hasText = false;

  // 씬 1개 = 요청 1개(video-production/scene)로 나눠 처리하는 구조라, OCR 재시도를
  // 무한정 늘리면 Vercel 함수 실행시간 한도를 넘겨 FUNCTION_INVOCATION_TIMEOUT이 남
  // (실측: 504로 재현됨). 2회로 맞추고 라우트의 maxDuration도 함께 늘렸다 — 그래도
  // 텍스트가 남아있으면 boss_feedback 알림으로 사람이 확인하도록 한다.
  const MAX_OCR_ATTEMPTS = 2;
  for (let attempt = 0; attempt < MAX_OCR_ATTEMPTS; attempt++) {
    const seedSuffix = attempt > 0 ? ` (variation ${attempt + 1}, avoid all text)` : "";
    const { data, contentType: ct } = await generateSceneImage(scene.imagePrompt + seedSuffix, referenceImageUrl);
    generated = { data, contentType: ct };

    const tmpPath = `scenes/ocr-check/${queueId}/${sceneIndex}_attempt${attempt}.${imageExtensionFor(ct)}`;
    const tmpUrl = await uploadBinaryObject({ bucket, objectPath: tmpPath, contentType: ct, data });
    hasText = await detectTextInImage(tmpUrl);
    console.log(`  OCR attempt ${attempt + 1}: hasText=${hasText}`);

    if (!hasText) break;
  }

  if (hasText) {
    console.warn(`  씬 ${sceneIndex + 1} OCR 실패 → boss_feedback 알림`);
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

export type VeoLroEntry = { sceneIndex: number; lroName: string; prompt: string };
export type ProduceVideoAssetsResult = { scenes: VideoScene[]; veoAsync?: boolean; fluxAsync?: boolean };

/** 승인된 유튜브 큐 항목의 스크립트를 씬으로 분해하고 Veo(또는 Flux) 자산을 생성.
 *  USE_VEO_VIDEO=true: ai_bg 씬에 Veo LRO만 제출 후 즉시 반환 (GitHub Actions가 폴링 완료).
 *  USE_VEO_VIDEO=false: 기존 Flux 동기 경로 유지.
 */
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
    const { scenes: rawPlanned, contiSummary, visualMotif } = await planVideoScenes(row.title, row.script);
    const planned = await resolveRealPhotoScenes(rawPlanned);
    const bucket = process.env.SUPABASE_VIDEO_BUCKET?.trim() || "dk-safety-video-assets";
    const masterCharacterUrl = await resolveMasterCharacterReference();
    console.log(masterCharacterUrl ? `[마스터 캐릭터] 참조 이미지 사용: ${masterCharacterUrl}` : `[마스터 캐릭터] 미등록 — 텍스트 일관성만 사용`);

    if (contiSummary) {
      console.log(`[콘티 요약] ${contiSummary.slice(0, 100)}...`);
    }
    if (visualMotif) console.log(`[시각 모티프] ${visualMotif}`);

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
    const veoLroNames: VeoLroEntry[] = [];

    for (let i = 0; i < planned.length; i++) {
      const scene = planned[i];
      const type = scene.sceneType ?? "ai_bg";
      console.log(`[씬 ${i + 1}/${planned.length}] type=${type}`);

      // ── ai_bg + Veo 비동기 모드: LRO 제출 후 즉시 다음 씬으로 ──────────────
      if (type === "ai_bg" && USE_VEO) {
        try {
          console.log(`  [Veo] LRO 제출: ${scene.imagePrompt.slice(0, 100)}...`);
          const lroName = await submitVeoLro(scene.imagePrompt);
          veoLroNames.push({ sceneIndex: i, lroName, prompt: scene.imagePrompt });
          scenes.push({ ...scene }); // videoUrl은 GitHub Actions에서 채움
        } catch (err) {
          console.error(`  [Veo] LRO 제출 실패 → Flux 폴백:`, err);
          await logGeminiUsage(supabase, "veo_video_fallback", queueId, i, 0, false).catch(() => undefined);
          const { imageUrl } = await produceAiBgSceneFlux(scene, queueId, i, bucket, masterCharacterUrl);
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

      // ── ai_bg + Flux (USE_VEO_VIDEO=false): 여기서 생성하지 않고 GitHub Actions에 위임 ──
      // 씬이 5~8개라 전부 동기로 생성하면 Vercel 함수 시간제한을 넘겨 504가 나는 문제가
      // 실제로 있었음 (Veo LRO 제출처럼 빠르게 끝나지 않고 Flux+OCR을 순차로 다 돌리기 때문).
      // imageUrl 없이 씬만 저장해두고 flux-complete.yml이 씬별로 나눠서 채운다.
      scenes.push({ ...scene });
    }

    // Veo 비동기: LRO 이름 저장 + veo_generating 상태 (GitHub Actions가 폴링 후 완료)
    if (USE_VEO && veoLroNames.length > 0) {
      await supabase
        .from("content_youtube_queue")
        .update({
          scenes,
          conti_summary: contiSummary || null,
          veo_lro_names: veoLroNames,
          status: "veo_generating",
          updated_at: new Date().toISOString(),
        })
        .eq("id", queueId)
        .throwOnError();
      console.log(`[Veo 비동기] ${veoLroNames.length}개 LRO 저장됨. GitHub Actions가 완료 처리.`);
      return { scenes, veoAsync: true };
    }

    // Flux 비동기: ai_bg 씬 중 imageUrl 없는 게 있으면 GitHub Actions에 완료 위임
    const needsFlux = scenes.some((s) => (s.sceneType ?? "ai_bg") === "ai_bg" && !s.imageUrl);
    if (!USE_VEO && needsFlux) {
      await supabase
        .from("content_youtube_queue")
        .update({ scenes, conti_summary: contiSummary || null, status: "producing", updated_at: new Date().toISOString() })
        .eq("id", queueId)
        .throwOnError();
      console.log(`[Flux 비동기] 씬 계획 저장됨. GitHub Actions가 이미지 생성 후 완료 처리.`);
      return { scenes, fluxAsync: true };
    }

    // 모든 씬이 이미 준비됨 (verdict_card/phone_ui만 있는 경우 등)
    await supabase
      .from("content_youtube_queue")
      .update({ scenes, conti_summary: contiSummary || null, status: "assets_ready", updated_at: new Date().toISOString() })
      .eq("id", queueId)
      .throwOnError();

    // 사람이 GitHub Actions에서 직접 눌러야 했던 최종 합성+업로드 단계를 자동 트리거한다.
    await dispatchGithubWorkflow("video-assembly.yml");

    return { scenes };
  } catch (err) {
    await supabase
      .from("content_youtube_queue")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", queueId);
    throw err;
  }
}
