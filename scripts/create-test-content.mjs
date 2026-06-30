// 테스트용 유튜브 콘텐츠 1건 생성 → content_youtube_queue pending_approval 삽입
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const BUSINESS_CONTEXT = `[우리집 전기주치의(대경이엔피) 현황]
- 브랜드: 우리집 전기주치의(대경이엔피), 광주광역시
- 사업 형태: 1인 사업자
- 타겟: 광주 아파트 입주민 (30~50대 주부, 안전에 민감)
- 주요 서비스: 아파트 전기 안전 점검, 콘센트/스위치/분전반 점검`;

function extractJsonBlock(text) {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return null;
}

async function callClaude(system, user, maxTokens = 3000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.content?.[0]?.text ?? "";
}

// ─── 1단계: 제목 + 기획 메모 생성 ────────────────────────────────────────────
console.log("1단계: 제목 + 기획 메모 생성 중…");

const planRaw = await callClaude(
  `당신은 우리집 전기주치의(대경이엔피)의 유튜브 PD입니다. ${BUSINESS_CONTEXT}
광주 아파트 입주민이 실제로 검색할 '전기 안전점검' 카테고리의 유튜브 쇼츠 주제 1개를 기획하라.
이미 많이 다뤄진 주제보다 구체적이고 생활 밀착형 주제를 선택하라.
JSON만 출력하라:
\`\`\`json
{"title": "영상 제목 (30자 이내, 클릭 유도)", "brief": "기획 메모 2~3줄: 핵심 메시지, 타깃 상황, 차별점"}
\`\`\``,
  "전기안전점검 카테고리 유튜브 쇼츠 주제 1개 생성해줘. 생활 밀착형으로.",
  500,
);

const planJson = extractJsonBlock(planRaw);
if (!planJson) throw new Error("기획 JSON 파싱 실패: " + planRaw.slice(0, 200));
const plan = JSON.parse(planJson);
console.log(`  제목: ${plan.title}`);
console.log(`  메모: ${plan.brief}`);

// ─── 2단계: 스크립트 생성 (plain text) ───────────────────────────────────────
console.log("\n2단계: 스크립트 생성 중…");

const scriptText = await callClaude(
  `당신은 우리집 전기주치의(대경이엔피)의 수석 유튜브 PD입니다.
${BUSINESS_CONTEXT}
스크립트만 출력하라 (JSON 아님, 마크다운 없이 순수 텍스트만):
- 씬별 구분 (씬 1 ~ 씬 N)
- 3~5분 분량, 5~8씬
- 오프닝 미스터리 훅 → 원리 설명 → 경고 → 안심 → CTA (dkansim.com)`,
  `영상 제목: ${plan.title}\n기획 메모: ${plan.brief}\n\n스크립트만 작성하라.`,
  2500,
);

// ─── 3단계: 썸네일 기획 생성 (plain text) ────────────────────────────────────
console.log("3단계: 썸네일 기획 생성 중…");

const thumbText = await callClaude(
  `당신은 유튜브 썸네일 디자이너입니다. 2~3줄 설명만 출력하라 (색상, 문구, 구도).`,
  `영상 제목: ${plan.title}\n카테고리: 전기안전\n썸네일 기획안을 간략히 작성하라.`,
  200,
);

const draft = { script: scriptText.trim(), thumbnailConcept: thumbText.trim() };
console.log(`  스크립트 길이: ${draft.script.length}자`);
console.log(`  썸네일: ${draft.thumbnailConcept.slice(0, 60)}…`);

// ─── 3단계: DB 삽입 ──────────────────────────────────────────────────────────
console.log("\n3단계: DB 삽입 중…");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const { data, error } = await supabase
  .from("content_youtube_queue")
  .insert({
    title: plan.title,
    competitor_notes: plan.brief,
    script: draft.script,
    thumbnail_concept: draft.thumbnailConcept,
    category: "전기안전",
    status: "pending_approval",
  })
  .select("id, title, status, category, created_at")
  .single();

if (error) {
  console.error("DB 삽입 실패:", error.message);
  process.exitCode = 1;
} else {
  console.log("\n═══════════════════════════════════════");
  console.log("✅ 테스트 콘텐츠 생성 완료!");
  console.log("═══════════════════════════════════════");
  console.log(`  ID:     ${data.id}`);
  console.log(`  제목:   ${data.title}`);
  console.log(`  상태:   ${data.status}`);
  console.log(`  카테고리: ${data.category}`);
  console.log(`  생성일: ${data.created_at}`);
  console.log("\nhq.dkansim.com/content 에서 확인하세요.");
}
