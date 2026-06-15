// 유튜브 채널 분석 에이전트 — 참고/경쟁 채널의 영상 패턴을 분석해 콘텐츠 제안 생성

import { requireAgentSupabase } from "@/lib/agent-db";
import { BUSINESS_CONTEXT, callClaudeCustom, extractJsonBlock } from "@/lib/agents";
import {
  fetchChannelTopVideos,
  resolveYoutubeChannel,
  type YoutubeChannelVideo,
} from "@/lib/youtube-pipeline";

const TRANSCRIPT_TARGET_COUNT = 3;
const MAX_TRANSCRIPT_CHARS = 1500;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** 워치페이지에서 자막 트랙을 찾아 자막 텍스트를 추출 (API 키 불필요, best-effort) */
export async function fetchVideoTranscript(videoId: string): Promise<string | null> {
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    const tracksMatch = html.match(/"captionTracks":(\[.*?\])/);
    if (!tracksMatch) return null;
    const tracksRaw = tracksMatch[1];

    const baseUrls = [...tracksRaw.matchAll(/"baseUrl":"(.*?)"/g)].map((m) => m[1]);
    const langCodes = [...tracksRaw.matchAll(/"languageCode":"(.*?)"/g)].map((m) => m[1]);
    if (baseUrls.length === 0) return null;

    let index = langCodes.findIndex((lang) => lang === "ko");
    if (index === -1) index = 0;

    const baseUrl = baseUrls[index].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    const subRes = await fetch(baseUrl, { signal: AbortSignal.timeout(15_000) });
    if (!subRes.ok) return null;
    const xml = await subRes.text();

    const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
      .map((m) => decodeHtmlEntities(m[1].replace(/<[^>]+>/g, "")).trim())
      .filter(Boolean);
    const text = lines.join(" ").replace(/\s+/g, " ").trim();
    return text || null;
  } catch {
    return null;
  }
}

const CHANNEL_ANALYSIS_SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 유튜브 채널 분석가입니다.
${BUSINESS_CONTEXT}
참고/경쟁 채널의 인기 영상 목록(제목, 조회수)과 일부 자막 발췌가 주어집니다.
1. 이 채널에서 어떤 주제·형식의 영상이 잘 통하는지 패턴을 2~4문장으로 분석하라 (patternSummary)
2. 분석한 패턴을 참고해, 우리 유튜브 채널을 위한 콘텐츠 제안 10건을 작성하라 (proposals)
   - 각 제안은 "전기안전"(광주 아파트 입주민 대상 가정용 전기안전/점검 B2C), "자격시험"(전기기사 자격시험 준비생 대상 교육 콘텐츠), "실무"(전기 현장 실무자 대상 노하우) 중 하나의 category로 분류하라
   - 10건이 3개 카테고리에 적절히 분산되도록 하라
   - 대장이 본업 병행 1인 사업자임을 고려해 스마트폰으로 직접 촬영 가능한 현실적인 영상만 제안하라

반드시 한국어로, 아래 JSON 형식으로만 응답하라(설명 텍스트 없이 JSON만):
\`\`\`json
{
  "patternSummary": "...",
  "proposals": [
    { "category": "전기안전", "title": "...", "brief": "..." }
  ]
}
\`\`\``;

function buildPrompt(channelName: string, videos: YoutubeChannelVideo[], transcripts: Map<string, string>): string {
  const videoLines = videos.map((v) => {
    const views = v.viewCount.toLocaleString("ko-KR");
    return `- ${v.title ?? "(제목 없음)"} (조회수 ${views})`;
  });

  const transcriptLines: string[] = [];
  for (const v of videos) {
    const transcript = transcripts.get(v.videoId);
    if (transcript) {
      transcriptLines.push(`[${v.title ?? v.videoId} 자막 발췌]`, transcript.slice(0, MAX_TRANSCRIPT_CHARS));
    }
  }

  return `[분석 대상 채널] ${channelName}

[인기 영상 목록]
${videoLines.join("\n")}

${transcriptLines.length ? transcriptLines.join("\n") : "(자막 수집 불가)"}

위 데이터를 분석하라.`;
}

export type ChannelAnalysisProposal = {
  category: "전기안전" | "자격시험" | "실무";
  title: string;
  brief: string;
};

export type ChannelAnalysisResult = {
  channelId: string;
  channelName: string;
  channelUrl: string;
  videos: (YoutubeChannelVideo & { hasTranscript: boolean })[];
  patternSummary: string;
  proposals: ChannelAnalysisProposal[];
  queueIds: string[];
};

const VALID_CATEGORIES = new Set(["전기안전", "자격시험", "실무"]);

/** 채널을 분석해 패턴 요약 + 콘텐츠 제안 10건을 생성하고 content_youtube_queue에 저장 */
export async function analyzeYoutubeChannel(input: string): Promise<ChannelAnalysisResult> {
  const resolved = await resolveYoutubeChannel(input);
  if (!resolved) {
    throw new Error(`채널을 찾을 수 없습니다: ${input}`);
  }

  const topVideos = await fetchChannelTopVideos(resolved.channelId, 12);
  if (topVideos.length === 0) {
    throw new Error("해당 채널의 영상을 찾을 수 없습니다.");
  }

  const transcriptTargets = topVideos.slice(0, TRANSCRIPT_TARGET_COUNT);
  const transcriptEntries = await Promise.all(
    transcriptTargets.map(async (v) => [v.videoId, await fetchVideoTranscript(v.videoId)] as const),
  );
  const transcripts = new Map(transcriptEntries.filter(([, text]) => text !== null) as [string, string][]);

  const channelName = resolved.channelName ?? input;
  const prompt = buildPrompt(channelName, topVideos, transcripts);
  const raw = await callClaudeCustom(CHANNEL_ANALYSIS_SYSTEM_PROMPT, prompt, 2500, 150_000);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) {
    throw new Error("채널 분석 응답에서 JSON을 파싱할 수 없습니다.");
  }

  const parsed = JSON.parse(jsonText) as { patternSummary?: string; proposals?: Partial<ChannelAnalysisProposal>[] };
  const patternSummary = String(parsed.patternSummary ?? "");
  const proposals: ChannelAnalysisProposal[] = (parsed.proposals ?? [])
    .slice(0, 10)
    .map((p) => ({
      category: VALID_CATEGORIES.has(String(p.category)) ? (p.category as ChannelAnalysisProposal["category"]) : "전기안전",
      title: String(p.title ?? "제목 미정"),
      brief: String(p.brief ?? ""),
    }));

  const supabase = requireAgentSupabase();
  const queueIds: string[] = [];
  for (const proposal of proposals) {
    const { data, error } = await supabase
      .from("content_youtube_queue")
      .insert({
        title: proposal.title,
        competitor_notes: `[${channelName} 분석 기반] ${proposal.brief}`,
        category: proposal.category,
        status: "planning",
      })
      .select("id")
      .single();
    if (error) throw error;
    if (data?.id) queueIds.push(data.id);
  }

  const videosWithFlag = topVideos.map((v) => ({ ...v, hasTranscript: transcripts.has(v.videoId) }));

  const { error: analysisError } = await supabase.from("youtube_channel_analyses").insert({
    channel_id: resolved.channelId,
    channel_name: channelName,
    channel_url: resolved.channelUrl,
    videos: videosWithFlag,
    pattern_summary: patternSummary,
    proposals,
    queue_ids: queueIds,
  });
  if (analysisError) throw analysisError;

  return {
    channelId: resolved.channelId,
    channelName,
    channelUrl: resolved.channelUrl,
    videos: videosWithFlag,
    patternSummary,
    proposals,
    queueIds,
  };
}
