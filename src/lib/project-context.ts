/**
 * dk-safety 프로젝트 현황(구현된 페이지/API/기능/연동, 미구현 기능)을 Gemini 검증에 참고 자료로
 * 제공하기 위한 컨텍스트 생성기. project_features 테이블이 원본, project_context_cache가 캐시.
 *
 * 코드 리뷰로 확인된 설계 원칙(이 파일이 지켜야 할 것):
 * - Vercel 서버리스 환경에서는 모듈 전역 변수가 호출 간에 안정적으로 유지되지 않으므로
 *   메모리 캐시를 두지 않는다 — DB 캐시(project_context_cache, 1시간)만 사용한다.
 * - 이 컨텍스트를 어디에 주입할지는 호출부(cross-validate.ts의 validateAgentAnswer 등)가
 *   선택적으로 결정한다. 이 파일 자체는 공유 Gemini 호출 경로에 끼어들지 않는다.
 */

import { requireAgentSupabase } from "@/lib/agent-db";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

type ProjectFeatureRow = {
  category: "page" | "api" | "feature" | "integration" | "pending";
  name: string;
  description: string;
  status: "implemented" | "pending" | "deprecated";
  path: string | null;
};

async function generateProjectContext(): Promise<string> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("project_features")
    .select("category, name, description, status, path")
    .order("category")
    .order("status");

  if (error || !data) return "";
  const features = data as ProjectFeatureRow[];

  const implemented = features.filter((f) => f.status === "implemented");
  const pending = features.filter((f) => f.status === "pending");

  const pages = implemented.filter((f) => f.category === "page");
  const apis = implemented.filter((f) => f.category === "api");
  const featureList = implemented.filter((f) => f.category === "feature");
  const integrations = implemented.filter((f) => f.category === "integration");

  return `
[dk-safety 프로젝트 컨텍스트 - 우리집 전기주치의(대경이엔피)]

## 기본 정보
- 사업자명: 대경이엔피 (사업자번호: 208-20-57629)
- 브랜드: 우리집 전기주치의
- 운영 도메인: dkansim.com (고객용), hq.dkansim.com (관리자용)
- 기술스택: Next.js 15, Supabase, Vercel, TypeScript
- 사업 분야: 전기안전 점검, 누전차단기 교체, 분전반 교체, 콘센트 교체

## 구현된 페이지 (${pages.length}개)
${pages.map((p) => `- ${p.name}: ${p.description}${p.path ? ` (${p.path})` : ""}`).join("\n")}

## 구현된 API (${apis.length}개)
${apis.map((a) => `- ${a.name}: ${a.description}${a.path ? ` (${a.path})` : ""}`).join("\n")}

## 구현된 핵심 기능 (${featureList.length}개)
${featureList.map((f) => `- ${f.name}: ${f.description}`).join("\n")}

## 연동된 외부 서비스 (${integrations.length}개)
${integrations.map((i) => `- ${i.name}: ${i.description}`).join("\n")}

## 미구현/예정 기능 (${pending.length}개) - 이 기능들은 현재 없음
${pending.map((p) => `- ${p.name}: ${p.description}`).join("\n")}

## 중요 규칙
- 위 "미구현/예정 기능"은 현재 존재하지 않음. 가능하다고 안내하면 안 됨.
- 구현된 기능만 사실로 답변하라.
- 불확실한 경우 "확인이 필요합니다"라고 답변하라.
  `.trim();
}

/** DB 캐시(1시간)를 우선 사용하고, 만료됐거나 없으면 새로 생성해 캐시에 저장한다. */
export async function getProjectContext(): Promise<string> {
  const supabase = requireAgentSupabase();

  try {
    const { data: cache } = await supabase
      .from("project_context_cache")
      .select("content, generated_at")
      .eq("context_type", "gemini_context")
      .maybeSingle();

    if (cache) {
      const age = Date.now() - new Date(cache.generated_at).getTime();
      if (age < CACHE_TTL_MS) return cache.content;
    }
  } catch {
    // 캐시 조회 실패 시 새로 생성해서 계속 진행
  }

  const context = await generateProjectContext();
  if (context) {
    await supabase
      .from("project_context_cache")
      .upsert(
        { context_type: "gemini_context", content: context, generated_at: new Date().toISOString() },
        { onConflict: "context_type" }
      );
  }
  return context;
}

/** project_features 변경 후 캐시를 즉시 갱신한다 (analyze-codebase.mjs, PATCH API에서 호출). */
export async function refreshProjectContext(): Promise<string> {
  const supabase = requireAgentSupabase();
  const context = await generateProjectContext();
  if (context) {
    await supabase
      .from("project_context_cache")
      .upsert(
        { context_type: "gemini_context", content: context, generated_at: new Date().toISOString() },
        { onConflict: "context_type" }
      );
  }
  return context;
}
