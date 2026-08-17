/**
 * project_features의 낡은 항목을 최신 상태로 갱신하고 project_context_cache를 즉시 재생성한다.
 * 총괄디렉터의 정확한 답변("9-에이전트", "영상 제작 가능")이 낡은 DB 설명("6에이전트",
 * "영상 파이프라인 미구현") 때문에 Gemini에게 거짓정보로 오탐 차단된 사건(2026-08-17)의 직접 수정.
 * Usage: npx tsx --env-file=.env.local scripts/fix-stale-project-features.mjs
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const updates = [
  {
    id: "e7eeac2c-bace-4ccc-8f80-095b246195b6", // "6에이전트 시스템"
    name: "9-에이전트 디렉터 파이프라인",
    description:
      "총괄디렉터(단독) → 자문단 CSO/COO/CFO/CLO(판단만, 산출물 없음) → 마케터 CMO/CTO(브리핑을 워커용 가이드라인으로 변환) → 워커 유튜브PD/카카오매니저/블로그에디터(제작 전담) 순차 위임 구조. 자문단 4명은 콘텐츠 발행(CLO)/경비·청구서(CFO)/작업자배정·콘텐츠작업등록(COO)/콘텐츠전략(CSO)/견적서·계약서(CLO+CFO) 5곳에서 검증 게이트 역할도 겸함(advisory-gates.ts).",
  },
  {
    id: "c21cba56-e172-4a3e-a68c-02e36560c0cb", // "영상 합성 파이프라인"
    status: "implemented",
    category: "feature",
    description:
      "Claude 씬 기획 → 실제 사진 우선 매칭(없으면 OpenRouter Flux 씬 이미지 생성) → Supertone/ElevenLabs/edge-tts 나레이션 → ffmpeg Ken Burns+자막 조립으로 유튜브 영상 자동 생성. dk-video-factory 로컬 워커가 처리하고, 대장이 hq.dkansim.com/videos에서 승인해야만 유튜브(비공개)에 업로드됨. 실제 업로드 성공 사례 있음(2026-07-07 첫 업로드 이후 다수).",
  },
  {
    id: "121d6237-a559-490c-8039-487f2e5fcd8a", // "풀 에이전트 저위험 자동구현"
    description:
      "채팅에서 저위험 코드 변경은 총괄디렉터가 auto_implement=true를 제안할 수 있지만, 최종 결정권은 코드 규칙(tech-risk-rules.ts::classifyTechRisk)에 있다 — 가격/결제/인증/DB스키마/삭제/알림발송/외부API/공개발행 관련이면 에이전트 판단과 무관하게 강제로 사람 검토(false)로 전환된다. 통과한 것만 GitHub Actions가 자동 구현·병합(사람검토 없이)하며, 변경 파일이 1개 초과면 블라스트 레이디어스 게이트가 자동병합을 추가로 보류시킨다.",
  },
  {
    id: "66a5657a-f1a1-4010-96ad-934dbdf3a252", // "AI 문서 생성"
    description:
      "점검보고서/견적서/완료확인서/안전안내문/계약서/제안서를 Claude가 작성. Gemini가 사실정확성/형식을 검증하고, 견적서·계약서·완료확인서·제안서(실제 금전·계약 문서)는 추가로 CLO(계약조건)+CFO(금액이 확정 요금 체계와 일치하는지) 검증을 통과해야 PDF+Word가 생성됨 — 반려되면 문서 자체가 만들어지지 않음.",
  },
];

for (const u of updates) {
  const { id, ...patch } = u;
  const { error } = await supabase.from("project_features").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error(`❌ ${id} 갱신 실패:`, error.message);
  } else {
    console.log(`✅ 갱신됨: ${u.name ?? id}`);
  }
}

// project_context_cache 즉시 재생성 (1시간 캐시를 기다리지 않게)
const { data: features, error: featErr } = await supabase
  .from("project_features")
  .select("category, name, description, status, path")
  .order("category")
  .order("status");
if (featErr) throw featErr;

const implemented = features.filter((f) => f.status === "implemented");
const pending = features.filter((f) => f.status === "pending");
const pages = implemented.filter((f) => f.category === "page");
const apis = implemented.filter((f) => f.category === "api");
const featureList = implemented.filter((f) => f.category === "feature");
const integrations = implemented.filter((f) => f.category === "integration");

const context = `
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

const { error: cacheErr } = await supabase
  .from("project_context_cache")
  .upsert(
    { context_type: "gemini_context", content: context, generated_at: new Date().toISOString() },
    { onConflict: "context_type" },
  );
if (cacheErr) throw cacheErr;

console.log("\n✅ project_context_cache 즉시 재생성 완료");
