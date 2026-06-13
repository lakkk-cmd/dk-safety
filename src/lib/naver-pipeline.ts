import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

export const NAVER_ENABLED = Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);

const NAVER_API_BASE = "https://openapi.naver.com/v1";

/** 콘텐츠 기획 시 기본으로 수집할 시드 키워드 (전기 안전/점검 관련) */
export const SEED_TREND_KEYWORDS = [
  "아파트 전기점검",
  "누전차단기 교체",
  "콘센트 교체",
  "분전반 교체",
  "광주 전기수리",
  "조명 교체 비용",
];

function naverHeaders(extra?: Record<string, string>): Record<string, string> {
  if (!NAVER_ENABLED) {
    throw new Error("NAVER_CLIENT_ID/NAVER_CLIENT_SECRET이 설정되지 않았습니다.");
  }
  return {
    "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID as string,
    "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET as string,
    ...extra,
  };
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

export type NaverBlogItem = {
  title: string;
  link: string;
  description: string;
  bloggerName: string;
  postDate: string;
};

/** 네이버 블로그 검색 — 경쟁 블로그 분석용 */
export async function searchNaverBlog(query: string, display = 10): Promise<NaverBlogItem[]> {
  const url = `${NAVER_API_BASE}/search/blog.json?query=${encodeURIComponent(query)}&display=${display}&sort=sim`;
  const res = await fetch(url, { headers: naverHeaders() });
  if (!res.ok) {
    throw new Error(`네이버 블로그 검색 실패: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { items?: Array<Record<string, string>> };
  return (json.items ?? []).map((item) => ({
    title: stripHtml(item.title ?? ""),
    link: item.link ?? "",
    description: stripHtml(item.description ?? ""),
    bloggerName: item.bloggername ?? "",
    postDate: item.postdate ?? "",
  }));
}

export type NaverTrendPoint = { period: string; ratio: number };
export type NaverTrendGroup = { title: string; keywords: string[]; data: NaverTrendPoint[] };

/** 네이버 데이터랩 검색어트렌드 — 최근 인기도 추이 */
export async function fetchSearchTrend(
  keywordGroups: { groupName: string; keywords: string[] }[],
  startDate: string,
  endDate: string,
): Promise<NaverTrendGroup[]> {
  const res = await fetch(`${NAVER_API_BASE}/datalab/search`, {
    method: "POST",
    headers: naverHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ startDate, endDate, timeUnit: "month", keywordGroups }),
  });
  if (!res.ok) {
    throw new Error(`네이버 데이터랩 조회 실패: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { results?: NaverTrendGroup[] };
  return json.results ?? [];
}

export type CollectNaverTrendsResult = {
  collected: number;
  keywords: string[];
  errors: string[];
};

/** 시드 키워드별 경쟁 블로그를 검색해 naver_trends 테이블에 저장 */
export async function collectNaverTrends(
  keywords: string[] = SEED_TREND_KEYWORDS,
): Promise<CollectNaverTrendsResult> {
  const supabase = requireAgentSupabase();
  const errors: string[] = [];
  let collected = 0;

  for (const keyword of keywords) {
    try {
      const items = await searchNaverBlog(keyword, 5);
      const { error } = await supabase.from("naver_trends").insert({
        keyword,
        source: "blog_search",
        data: { items },
      });
      if (error) throw error;
      collected += 1;
    } catch (err) {
      errors.push(`${keyword}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { collected, keywords, errors };
}

/** 최근 수집된 트렌드 키워드 목록 (콘텐츠 기획 프롬프트에 전달) */
export async function getRecentTrendKeywords(limit = 10): Promise<string[]> {
  if (!isAgentSupabaseReady()) return [];
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("naver_trends")
    .select("keyword, collected_at")
    .order("collected_at", { ascending: false })
    .limit(limit * 3);
  if (error || !data) return [];

  const seen = new Set<string>();
  for (const row of data as { keyword: string }[]) {
    seen.add(row.keyword);
    if (seen.size >= limit) break;
  }
  return Array.from(seen);
}

/** 특정 키워드에 대해 가장 최근 수집된 경쟁 블로그 목록 (블로그 에디터 참고용) */
export async function getCompetitorInsights(keyword: string, limit = 5): Promise<NaverBlogItem[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("naver_trends")
    .select("data")
    .eq("keyword", keyword)
    .eq("source", "blog_search")
    .order("collected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return [];

  const items = (data as { data?: { items?: NaverBlogItem[] } }).data?.items ?? [];
  return items.slice(0, limit);
}
