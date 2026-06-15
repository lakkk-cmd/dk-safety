// 시장 정보 자동 수집 에이전트 — 구글 뉴스/네이버/유튜브 수집 + Claude 분석 (전기안전/자격시험/실무)

import { requireAgentSupabase } from "@/lib/agent-db";
import { BUSINESS_CONTEXT, callClaudeCustom, extractJsonBlock } from "@/lib/agents";
import { NAVER_ENABLED, fetchSearchTrend, searchNaverBlog, type NaverBlogItem, type NaverTrendPoint } from "@/lib/naver-pipeline";
import { searchPopularVideos, type YoutubePopularItem } from "@/lib/youtube-pipeline";

export type IntelCategory = "전기안전" | "자격시험" | "실무";

export const INTEL_CATEGORIES: IntelCategory[] = ["전기안전", "자격시험", "실무"];

const CATEGORY_DESCRIPTIONS: Record<IntelCategory, string> = {
  전기안전: "광주 아파트 입주민 대상 가정용 전기안전/점검/수리 서비스(B2C)",
  자격시험: "전기기사 자격시험 준비생 대상 교육 콘텐츠(강의 추천/합격 후기/공부법)",
  실무: "전기 현장 실무자 대상 실무 노하우/시공 콘텐츠",
};

type CategoryQueries = {
  googleNews: string[];
  naverBlog: string[];
  naverTrend: { groupName: string; keywords: string[] }[];
  youtube: string[];
};

const CATEGORY_QUERIES: Record<IntelCategory, CategoryQueries> = {
  전기안전: {
    googleNews: ["전기안전 점검", "누전 사고", "아파트 화재 전기", "한국전기안전공사"],
    naverBlog: ["전기안전 점검 후기", "누전차단기 교체 비용"],
    naverTrend: [{ groupName: "전기안전", keywords: ["전기안전", "누전차단기", "아파트 전기점검"] }],
    youtube: ["전기안전 점검", "누전차단기 교체"],
  },
  자격시험: {
    googleNews: ["전기기사 시험 출제", "전기기사 합격 후기", "Q-net 전기기사 공지"],
    naverBlog: ["전기기사 합격 후기", "전기기사 공부법", "전기기사 인강 추천"],
    naverTrend: [{ groupName: "전기기사", keywords: ["전기기사", "전기기사 인강", "전기기사 실기"] }],
    youtube: ["전기기사 강의", "전기기사 필기 합격"],
  },
  실무: {
    googleNews: ["전기설비 점검 실무", "전기공사 현장 실무"],
    naverBlog: ["전기 실무 노하우", "전기기사 실무 꿀팁"],
    naverTrend: [{ groupName: "전기실무", keywords: ["전기 실무", "전기설비 점검", "전기공사"] }],
    youtube: ["전기 실무 강의", "전기공사 시공"],
  },
};

// ─── 구글 뉴스 RSS ─────────────────────────────────────────────────────────────

export type GoogleNewsItem = { title: string; link: string; pubDate: string; source: string };

const GOOGLE_NEWS_BASE = "https://news.google.com/rss/search";

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTag(block: string, tag: string): string {
  const cdataMatch = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  if (cdataMatch) return decodeXmlEntities(cdataMatch[1].trim());
  const plainMatch = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return plainMatch ? decodeXmlEntities(plainMatch[1].trim()) : "";
}

/** 구글 뉴스 RSS XML을 파싱 (정규식 기반, 의존성 없음) */
export function parseGoogleNewsRss(xml: string): GoogleNewsItem[] {
  const items: GoogleNewsItem[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    if (!title) continue;
    items.push({
      title,
      link: extractTag(block, "link"),
      pubDate: extractTag(block, "pubDate"),
      source: extractTag(block, "source"),
    });
  }
  return items;
}

/** 키워드로 구글 뉴스 검색 (API 키 불필요) */
export async function collectGoogleNews(query: string, max = 5): Promise<GoogleNewsItem[]> {
  const url = `${GOOGLE_NEWS_BASE}?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    throw new Error(`구글 뉴스 RSS 조회 실패: ${res.status}`);
  }
  const xml = await res.text();
  return parseGoogleNewsRss(xml).slice(0, max);
}

// ─── 카테고리별 원시 데이터 수집 ──────────────────────────────────────────────────

export type CollectionRawData = {
  googleNews: { query: string; items: GoogleNewsItem[] }[];
  naverBlog: { query: string; items: NaverBlogItem[] }[];
  naverTrend: { groupName: string; data: NaverTrendPoint[] }[];
  youtube: { query: string; items: YoutubePopularItem[] }[];
};

export type CollectionResult = {
  category: IntelCategory;
  collected: number;
  skipped: number;
  errors: string[];
  raw: CollectionRawData;
};

/** 카테고리별로 구글 뉴스/네이버/유튜브를 수집해 market_intelligence에 저장 */
export async function runCollectionForCategory(category: IntelCategory): Promise<CollectionResult> {
  const supabase = requireAgentSupabase();
  const queries = CATEGORY_QUERIES[category];
  const errors: string[] = [];
  let collected = 0;
  let skipped = 0;
  const raw: CollectionRawData = { googleNews: [], naverBlog: [], naverTrend: [], youtube: [] };

  for (const query of queries.googleNews) {
    try {
      const items = await collectGoogleNews(query);
      raw.googleNews.push({ query, items });
      const { error } = await supabase
        .from("market_intelligence")
        .insert({ category, source: "google_news", keyword: query, data: { items } });
      if (error) throw error;
      collected += 1;
    } catch (err) {
      errors.push(`google_news(${query}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (NAVER_ENABLED) {
    for (const query of queries.naverBlog) {
      try {
        const items = await searchNaverBlog(query, 5);
        raw.naverBlog.push({ query, items });
        const { error } = await supabase
          .from("market_intelligence")
          .insert({ category, source: "naver_blog", keyword: query, data: { items } });
        if (error) throw error;
        collected += 1;
      } catch (err) {
        errors.push(`naver_blog(${query}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const group of queries.naverTrend) {
      try {
        const endDate = new Date().toISOString().slice(0, 10);
        const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const results = await fetchSearchTrend(
          [{ groupName: group.groupName, keywords: group.keywords }],
          startDate,
          endDate,
        );
        const data = results[0]?.data ?? [];
        raw.naverTrend.push({ groupName: group.groupName, data });
        const { error } = await supabase
          .from("market_intelligence")
          .insert({ category, source: "naver_datalab", keyword: group.groupName, data: { keywords: group.keywords, points: data } });
        if (error) throw error;
        collected += 1;
      } catch (err) {
        errors.push(`naver_datalab(${group.groupName}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    skipped += queries.naverBlog.length + queries.naverTrend.length;
  }

  if (process.env.YOUTUBE_API_KEY?.trim()) {
    for (const query of queries.youtube) {
      try {
        const items = await searchPopularVideos(query, 5);
        raw.youtube.push({ query, items });
        const { error } = await supabase
          .from("market_intelligence")
          .insert({ category, source: "youtube", keyword: query, data: { items } });
        if (error) throw error;
        collected += 1;
      } catch (err) {
        errors.push(`youtube(${query}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    skipped += queries.youtube.length;
  }

  return { category, collected, skipped, errors, raw };
}

// ─── Claude 분석 (트렌드 키워드 / 인사이트 / 콘텐츠 기획안) ────────────────────────────

export type MarketInsight = {
  category: IntelCategory;
  trendKeywords: string[];
  insight: string;
  contentIdeas: { title: string; brief: string }[];
};

function marketIntelSystemPrompt(category: IntelCategory): string {
  return `당신은 우리집 전기주치의(대경이엔피)의 시장 정보 분석가입니다.
매일 수집된 "${category}" 카테고리(${CATEGORY_DESCRIPTIONS[category]}) 관련 뉴스/트렌드/유튜브 데이터를 분석합니다.
${BUSINESS_CONTEXT}
아래 수집 데이터를 바탕으로:
1. 트렌드 키워드 5개를 추출하라 (trendKeywords)
2. 우리 사업에 적용 가능한 인사이트를 2~3문장으로 작성하라 (insight)
3. 콘텐츠 기획안 3건을 제시하라 (contentIdeas, 각 title+brief)

반드시 한국어로, 아래 JSON 형식으로만 응답하라(설명 텍스트 없이 JSON만):
\`\`\`json
{
  "trendKeywords": ["...", "...", "...", "...", "..."],
  "insight": "...",
  "contentIdeas": [
    { "title": "...", "brief": "..." },
    { "title": "...", "brief": "..." },
    { "title": "...", "brief": "..." }
  ]
}
\`\`\``;
}

function summarizeRawData(raw: CollectionRawData): string {
  const lines: string[] = [];

  const newsItems = raw.googleNews.flatMap((g) => g.items.map((i) => `- [뉴스] ${i.title}${i.source ? ` (${i.source})` : ""}`));
  if (newsItems.length) lines.push("[구글 뉴스]", ...newsItems.slice(0, 15));

  const blogItems = raw.naverBlog.flatMap((g) => g.items.map((i) => `- [블로그] ${i.title}`));
  if (blogItems.length) lines.push("[네이버 블로그]", ...blogItems.slice(0, 10));

  const trendLines = raw.naverTrend.map((g) => {
    const latest = g.data
      .slice(-3)
      .map((p) => `${p.period}=${p.ratio}`)
      .join(", ");
    return `- ${g.groupName}: ${latest || "데이터 없음"}`;
  });
  if (trendLines.length) lines.push("[네이버 데이터랩 트렌드]", ...trendLines);

  const ytItems = raw.youtube.flatMap((g) => g.items.map((i) => `- [유튜브] ${i.title}${i.channelTitle ? ` (${i.channelTitle})` : ""}`));
  if (ytItems.length) lines.push("[유튜브 인기 영상]", ...ytItems.slice(0, 10));

  return lines.length ? lines.join("\n") : "(수집된 데이터 없음)";
}

/** 수집 데이터를 Claude로 분석해 market_intelligence_insights에 upsert */
export async function analyzeMarketIntelligence(category: IntelCategory, raw: CollectionRawData): Promise<MarketInsight> {
  const summary = summarizeRawData(raw);
  const prompt = `[오늘 수집된 데이터]\n${summary}\n\n위 데이터를 분석하라.`;

  const result: MarketInsight = { category, trendKeywords: [], insight: "", contentIdeas: [] };

  try {
    const response = await callClaudeCustom(marketIntelSystemPrompt(category), prompt, 1200, 120_000);
    const jsonText = extractJsonBlock(response);
    if (jsonText) {
      const parsed = JSON.parse(jsonText) as Partial<MarketInsight>;
      result.trendKeywords = Array.isArray(parsed.trendKeywords) ? parsed.trendKeywords.map(String).slice(0, 5) : [];
      result.insight = String(parsed.insight ?? "");
      result.contentIdeas = Array.isArray(parsed.contentIdeas)
        ? parsed.contentIdeas
            .slice(0, 3)
            .map((c) => ({ title: String(c?.title ?? ""), brief: String(c?.brief ?? "") }))
        : [];
    } else {
      result.insight = response.trim().slice(0, 1000);
    }
  } catch (err) {
    result.insight = `분석 실패: ${err instanceof Error ? err.message : String(err)}`;
  }

  const supabase = requireAgentSupabase();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const { error } = await supabase.from("market_intelligence_insights").upsert(
    {
      date: today,
      category,
      trend_keywords: result.trendKeywords,
      insight: result.insight,
      content_ideas: result.contentIdeas,
    },
    { onConflict: "date,category" },
  );
  if (error) throw error;

  return result;
}

// ─── 전체 실행 ─────────────────────────────────────────────────────────────────

export type MarketIntelligenceCategoryResult = {
  category: IntelCategory;
  collected: number;
  skipped: number;
  errors: string[];
  insight: MarketInsight;
};

/** 3개 카테고리(전기안전/자격시험/실무) 수집 + 분석을 순차 실행 */
export async function runMarketIntelligenceCollection(): Promise<MarketIntelligenceCategoryResult[]> {
  const results: MarketIntelligenceCategoryResult[] = [];
  for (const category of INTEL_CATEGORIES) {
    const collection = await runCollectionForCategory(category);
    const insight = await analyzeMarketIntelligence(category, collection.raw);
    results.push({
      category,
      collected: collection.collected,
      skipped: collection.skipped,
      errors: collection.errors,
      insight,
    });
  }
  return results;
}
