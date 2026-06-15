// 영상 제작 파이프라인 — 승인된 유튜브 스크립트를 씬으로 분해하고 Flux 이미지를 생성

import { requireAgentSupabase } from "@/lib/agent-db";
import { BUSINESS_CONTEXT, callClaudeCustom, extractJsonBlock } from "@/lib/agents";
import { uploadBinaryObject } from "@/lib/supabase-server";

export type VideoScene = {
  narration: string;
  imagePrompt: string;
  imageUrl?: string;
};

const MIN_SCENES = 5;
const MAX_SCENES = 8;

const SCENE_PLAN_SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 영상 제작 PD입니다.
${BUSINESS_CONTEXT}
주어진 유튜브 쇼츠(9:16 세로 영상) 스크립트를 ${MIN_SCENES}~${MAX_SCENES}개의 씬으로 분해하라.

각 씬은 다음 두 필드를 가진다:
- narration: 한국어, 1~2문장. 모든 씬의 narration을 순서대로 이어 읽으면 스크립트 전체 내용을 자연스럽게 커버해야 한다.
- imagePrompt: 영어. Flux 이미지 생성 모델에 전달할 프롬프트. 세로(9:16, vertical composition) 구도를 명시하고, 한국 가정/아파트의 전기 설비(분전반, 콘센트, 스위치, 누전차단기 등)나 전기기사가 작업하는 현장을 사실적 사진 또는 깔끔한 플랫 일러스트 스타일로 묘사하라.

반드시 한국어로 응답하되 imagePrompt는 영어로 작성하고, 아래 JSON 형식으로만 응답하라(설명 텍스트 없이 JSON만):
\`\`\`json
{
  "scenes": [
    { "narration": "...", "imagePrompt": "..." }
  ]
}
\`\`\``;

/** 스크립트를 9:16 쇼츠용 씬 5~8개로 분해 (narration 한국어 + imagePrompt 영어) */
export async function planVideoScenes(title: string, script: string): Promise<VideoScene[]> {
  const prompt = `${BUSINESS_CONTEXT}
영상 제목: ${title}

[스크립트]
${script}

위 스크립트를 씬으로 분해하라.`.trim();

  const raw = await callClaudeCustom(SCENE_PLAN_SYSTEM_PROMPT, prompt, 3000, 120_000);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) {
    throw new Error("씬 분해 응답에서 JSON을 파싱할 수 없습니다.");
  }

  const parsed = JSON.parse(jsonText) as { scenes?: Partial<VideoScene>[] };
  const scenes = (parsed.scenes ?? [])
    .map((s) => ({
      narration: String(s.narration ?? "").trim(),
      imagePrompt: String(s.imagePrompt ?? "").trim(),
    }))
    .filter((s) => s.narration && s.imagePrompt)
    .slice(0, MAX_SCENES);

  if (scenes.length === 0) {
    throw new Error("씬 분해 결과가 비어 있습니다.");
  }

  return scenes;
}

const DEFAULT_IMAGE_MODEL = "black-forest-labs/flux.2-pro";

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function imageExtensionFor(contentType: string): string {
  return CONTENT_TYPE_EXT[contentType] ?? "png";
}

/** OpenRouter Flux로 씬 이미지를 생성 (9:16, base64 이미지 반환) */
export async function generateSceneImage(prompt: string): Promise<{ data: Buffer; contentType: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY가 설정되지 않았습니다.");
  }

  const model = process.env.OPENROUTER_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image"],
      image_config: { aspect_ratio: "9:16", image_size: "1K" },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw.slice(0, 300);
    try {
      const err = JSON.parse(raw) as { error?: { message?: string } };
      detail = err.error?.message ?? detail;
    } catch {
      /* keep raw */
    }
    throw new Error(`OpenRouter 이미지 생성 ${res.status}: ${detail}`);
  }

  const json = JSON.parse(raw) as {
    choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
  };
  const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl) {
    throw new Error("OpenRouter 응답에 이미지가 없습니다.");
  }

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("OpenRouter 이미지 응답 형식을 인식할 수 없습니다.");
  }

  return { data: Buffer.from(match[2], "base64"), contentType: match[1] };
}

export type ProduceVideoAssetsResult = { scenes: VideoScene[] };

/** 승인된 유튜브 큐 항목의 스크립트를 씬으로 분해하고, 각 씬의 Flux 이미지를 생성해 Storage에 업로드 */
export async function produceVideoAssets(queueId: string): Promise<ProduceVideoAssetsResult> {
  const supabase = requireAgentSupabase();

  const { data: row, error } = await supabase
    .from("content_youtube_queue")
    .select("id, title, script, status")
    .eq("id", queueId)
    .single();
  if (error || !row) throw error ?? new Error("유튜브 큐 항목을 찾을 수 없습니다.");
  if (row.status !== "approved") {
    throw new Error(`영상 제작은 승인된(approved) 항목만 가능합니다. 현재 상태: ${row.status}`);
  }
  if (!row.script) {
    throw new Error("스크립트가 없는 항목입니다.");
  }

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
      const { data, contentType } = await generateSceneImage(scene.imagePrompt);
      const ext = imageExtensionFor(contentType);
      const imageUrl = await uploadBinaryObject({
        bucket,
        objectPath: `scenes/${queueId}/${i}.${ext}`,
        contentType,
        data,
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
