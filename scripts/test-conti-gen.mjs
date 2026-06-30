// 콘티 생성 품질 테스트 — Anthropic API 직접 호출 (Next.js 불필요)
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const ITEM_ID = "812fc660-1706-493c-ac70-6a3eeee0d9f5";

const MIN_SCENES = 5;
const MAX_SCENES = 8;

const BUSINESS_CONTEXT = `[우리집 전기주치의(대경이엔피) 현황]
- 브랜드: 우리집 전기주치의(대경이엔피), 광주광역시
- 사업 형태: 1인 사업자
- 대장 제약: 본업(아파트 전기팀장) 병행, 주말/저녁만 운영
- 타겟: 광주 아파트 입주민 (30~50대 주부, 안전에 민감)
- 주요 채널: 유튜브 쇼츠, 카카오채널, 블로그 (SEO)`;

const SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 수석 영상 감독(DOP)이자 Veo 3.1 프롬프트 아키텍트입니다.
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

### 3단계: ai_bg 씬마다 Veo 프롬프트 작성
7가지 요소를 모두 포함한 영어 프롬프트 (2~4문장, 8초 분량):
1. Scene description: 인물·사물·배경 구체 묘사 (한국 아파트 내부)
2. Camera angle: 감정과 일치
3. Camera movement: 감정 반영
4. Lighting: 색온도로 감정 표현
5. Mood/atmosphere: 감정 톤 명시
6. Action/motion: 씬 내 동작
7. Visual style: "Photorealistic documentary style, 9:16 vertical, no readable text, no Korean characters"
마지막에 Continuity 메모 추가.

---

## 5가지 영화적 장치 (반드시 적용)
1. 오프닝 미스터리: 씬1은 결과/긴장 상황 먼저
2. 반복 시각 모티프: 선정한 모티프가 여러 씬에 등장
3. 컷 리듬 다양성: 긴장=빠른 컷, 설명=안정적
4. 클로징 시각 콜백: 마지막 씬 = 오프닝 씬 구도의 해결된 버전
5. 3단 정보 구성: wide → close-up → medium reaction

---

## 출력 형식 (JSON만, 설명 없이)
\`\`\`json
{
  "contiSummary": "전체 콘티 요약 2~3문단: 감정 곡선, 5가지 영화적 장치, 반복 모티프",
  "visualMotif": "선정한 반복 시각 모티프 한 줄",
  "scenes": [
    {
      "narration": "한국어 1~2문장",
      "sceneType": "ai_bg",
      "emotionTone": "긴장|경고|설명|안심|CTA 중 하나",
      "connectionNote": "직전 씬과 연결 메모",
      "imagePrompt": "7요소 포함 영어 프롬프트. Continuity: ...",
      "koreanSummary": "대장이 이 씬을 한 줄로 이해할 수 있는 설명"
    }
  ]
}
\`\`\``;

function extractJsonBlock(text) {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1) return text.slice(braceStart, braceEnd + 1);
  return null;
}

// Fetch item from Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const { data: item, error } = await supabase
  .from("content_youtube_queue")
  .select("id, title, script")
  .eq("id", ITEM_ID)
  .single();

if (error || !item) {
  console.error("DB 오류:", error?.message);
  process.exitCode = 1;
} else {
  console.log(`\n제목: ${item.title}`);
  console.log(`스크립트 길이: ${item.script.length}자`);
  console.log("\n─── Claude 콘티 생성 중 (최대 120초)… ───\n");

  const userPrompt = `영상 제목: ${item.title}\n\n[스크립트]\n${item.script}\n\n위 스크립트를 단편 영화처럼 씬으로 분해하라.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 5000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Claude API 오류:", res.status, errText);
    process.exitCode = 1;
  } else {
    const json = await res.json();
    const raw = json.content?.[0]?.text ?? "";
    const jsonText = extractJsonBlock(raw);

    if (!jsonText) {
      console.error("JSON 파싱 실패. Raw 응답:\n", raw.slice(0, 500));
      process.exitCode = 1;
    } else {
      const parsed = JSON.parse(jsonText);
      console.log("═══════════════════════════════════════");
      console.log("콘티 요약 (contiSummary):");
      console.log("═══════════════════════════════════════");
      console.log(parsed.contiSummary);
      console.log("\n반복 시각 모티프:", parsed.visualMotif);
      console.log("\n═══════════════════════════════════════");
      console.log(`씬 목록 (${parsed.scenes?.length ?? 0}씬):`);
      console.log("═══════════════════════════════════════");
      for (const [i, s] of (parsed.scenes ?? []).entries()) {
        console.log(`\n[씬 ${i + 1}] ${s.sceneType ?? "?"} / ${s.emotionTone ?? "?"}`);
        console.log(`  한국어 요약: ${s.koreanSummary}`);
        console.log(`  나레이션: ${s.narration}`);
        console.log(`  연결 메모: ${s.connectionNote}`);
        console.log(`  imagePrompt:\n  ${s.imagePrompt}`);
      }
      console.log("\n─── 완료 ───");
    }
  }
}
