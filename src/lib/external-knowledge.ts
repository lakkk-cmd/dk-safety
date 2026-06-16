/**
 * 외부 데이터 자동 수집 → RAG 지식베이스 삽입
 *
 * 매주 일요일 06:00 KST 실행. 7개 카테고리별 Google News RSS 검색 →
 * Claude 요약(2-3단락) → 임베딩 → knowledge_base INSERT.
 * 동일 카테고리의 90일 이상 된 외부 항목은 자동 삭제.
 */

import { requireAgentSupabase } from "@/lib/agent-db";
import { BUSINESS_CONTEXT, callClaudeCustom } from "@/lib/agents";
import { embedText } from "@/lib/embeddings";
import { collectGoogleNews, type GoogleNewsItem } from "@/lib/market-intelligence";

export type ExternalCategory =
  | "law"
  | "gov_support"
  | "industry_news"
  | "competitor"
  | "certification"
  | "local"
  | "tax";

export const EXTERNAL_CATEGORIES: ExternalCategory[] = [
  "law",
  "gov_support",
  "industry_news",
  "competitor",
  "certification",
  "local",
  "tax",
];

const CATEGORY_META: Record<
  ExternalCategory,
  { label: string; keywords: string[]; purpose: string }
> = {
  law: {
    label: "법령·규정",
    keywords: [
      "전기안전관리법 개정",
      "KEC 전기설비규정 변경",
      "산업안전보건법 전기",
    ],
    purpose:
      "전기 관련 법령·규정 변경 사항. 사업 운영 시 준수해야 할 의무 파악.",
  },
  gov_support: {
    label: "정부지원",
    keywords: [
      "KIBO 창업기업 우대보증",
      "소상공인 지원사업 2026",
      "전기안전 관련 정부 지원금",
    ],
    purpose:
      "소상공인·전기 업종 대상 정부 지원사업·보증 제도. 자금 조달 기회 파악.",
  },
  industry_news: {
    label: "업계뉴스",
    keywords: ["아파트 전기화재 통계", "누전 사고 뉴스"],
    purpose:
      "전기 안전사고·화재 통계 및 업계 이슈. 마케팅 소재 및 위험 인식 파악.",
  },
  competitor: {
    label: "경쟁사",
    keywords: ["전기안전점검 서비스 가격", "아파트 전기진단 업체"],
    purpose:
      "경쟁 업체 가격·서비스 현황. 포지셔닝 및 가격 전략 수립.",
  },
  certification: {
    label: "자격증",
    keywords: ["전기기사 제도 변경", "전기공사기사 자격"],
    purpose:
      "전기기사·전기공사기사 시험·제도 변경. 자격시험 콘텐츠 기획.",
  },
  local: {
    label: "지역정보",
    keywords: ["광주광역시 아파트 정책", "광주 전기안전"],
    purpose:
      "광주 지역 아파트 관련 정책·이슈. 지역 마케팅 전략 수립.",
  },
  tax: {
    label: "세무",
    keywords: ["일반과세자 세법 개정 2026"],
    purpose:
      "소상공인 일반과세자 세법 변경. 절세 및 신고 전략 수립.",
  },
};

const DAYS_90 = 90 * 24 * 60 * 60 * 1000;

export type ExternalCollectResult = {
  category: ExternalCategory;
  inserted: number;
  deleted: number;
  error?: string;
};

/** 단일 카테고리 수집 → 요약 → 임베딩 → DB */
export async function collectExternalCategory(
  category: ExternalCategory,
): Promise<ExternalCollectResult> {
  const supabase = requireAgentSupabase();
  const meta = CATEGORY_META[category];

  // ── 1. Google News RSS 수집 ─────────────────────────────────────────────────
  const allArticles: GoogleNewsItem[] = [];
  for (const kw of meta.keywords) {
    try {
      const items = await collectGoogleNews(kw, 5);
      allArticles.push(...items);
    } catch {
      // 개별 키워드 실패는 무시하고 계속 진행
    }
  }

  if (allArticles.length === 0) {
    return { category, inserted: 0, deleted: 0, error: "수집된 기사 없음" };
  }

  // 중복 제목 제거
  const unique = allArticles.filter(
    (a, i, arr) => arr.findIndex((b) => b.title === a.title) === i,
  );

  // ── 2. Claude 요약 (2-3단락) ────────────────────────────────────────────────
  const articleList = unique
    .map((a, i) => `${i + 1}. [${a.pubDate}] ${a.title} (출처: ${a.source})`)
    .join("\n");

  const prompt = `${BUSINESS_CONTEXT}

아래는 "${meta.label}" 카테고리 검색 결과입니다.
목적: ${meta.purpose}

[수집된 기사 목록]
${articleList}

위 기사들을 바탕으로 사업주가 알아야 할 핵심 내용을 2-3단락(각 3-5문장)으로 요약해주세요.
- 실무적으로 중요한 변경사항이나 수치를 우선 포함
- 날짜가 있는 경우 언급
- 출처 번호([1], [2] 등) 인용 포함
- 한국어로 작성`;

  let summary: string;
  try {
    summary = await callClaudeCustom(
      "당신은 사업 정보 요약 전문가입니다. 검색 결과를 실무 중심으로 간결하게 요약합니다.",
      prompt,
      800,
    );
    summary = summary.trim();
  } catch (e) {
    return {
      category,
      inserted: 0,
      deleted: 0,
      error: `Claude 요약 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // ── 3. 임베딩 ────────────────────────────────────────────────────────────────
  const title = `[${meta.label}] ${new Date().toISOString().slice(0, 10)} 최신 동향`;
  const fullText = `${title}\n${summary}`;

  let embedding: number[];
  try {
    embedding = await embedText(fullText);
  } catch (e) {
    return {
      category,
      inserted: 0,
      deleted: 0,
      error: `임베딩 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // ── 4. INSERT ────────────────────────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + DAYS_90).toISOString();
  const { error: insErr } = await supabase.from("knowledge_base").insert({
    source: "google_news_rss",
    title,
    content: summary,
    embedding,
    category,
    is_external: true,
    expires_at: expiresAt,
  });

  if (insErr) {
    return {
      category,
      inserted: 0,
      deleted: 0,
      error: `DB 삽입 실패: ${insErr.message}`,
    };
  }

  // ── 5. 90일 초과 외부 항목 삭제 ──────────────────────────────────────────────
  const cutoff = new Date(Date.now() - DAYS_90).toISOString();
  const { count: deleted } = await supabase
    .from("knowledge_base")
    .delete({ count: "exact" })
    .eq("category", category)
    .eq("is_external", true)
    .lt("created_at", cutoff);

  return { category, inserted: 1, deleted: deleted ?? 0 };
}

/** 전체 7개 카테고리 순차 실행 */
export async function runExternalKnowledgeCollection(): Promise<ExternalCollectResult[]> {
  const results: ExternalCollectResult[] = [];
  for (const cat of EXTERNAL_CATEGORIES) {
    const result = await collectExternalCategory(cat);
    results.push(result);
  }
  return results;
}
