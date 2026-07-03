/**
 * Flux 씬 완료 스크립트 (GitHub Actions 전용)
 * status='producing'이고 ai_bg 씬 중 imageUrl이 비어있는 큐 항목을 찾아,
 * 씬 하나씩 /api/admin/content/video-production/scene 를 호출해 채운 뒤
 * /api/admin/content/video-production/finalize 로 assets_ready 전환한다.
 *
 * 전체 씬을 한 Vercel 함수 호출 안에서 순차 생성하면 시간제한을 넘겨 504가 나던
 * 문제 때문에, 씬 하나당 별도의 (짧은) 요청으로 나눠서 처리한다.
 *
 * 실행: node scripts/complete-flux-scenes.mjs [queueId]
 *   queueId 생략 시 producing 상태이면서 ai_bg 씬에 imageUrl 없는 항목 전체 처리
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const AGENT_WRITE_SECRET = process.env.AGENT_WRITE_SECRET?.trim();
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://dkansim.com").replace(/\/$/, "");

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("❌ Supabase 환경변수 미설정"); process.exit(1); }
if (!AGENT_WRITE_SECRET) { console.error("❌ AGENT_WRITE_SECRET 미설정"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const TARGET_ID = process.argv[2]?.trim() || null;

function needsFlux(row) {
  const scenes = row.scenes ?? [];
  return scenes.some((s) => (s.sceneType ?? "ai_bg") === "ai_bg" && !s.imageUrl);
}

async function callApi(path, body) {
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AGENT_WRITE_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(100_000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { message: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(`${path} ${res.status}: ${json.message ?? text.slice(0, 200)}`);
  return json;
}

async function processItem(row) {
  console.log(`\n대상: ${row.id} | ${row.title}`);
  const scenes = row.scenes ?? [];
  const targets = scenes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => (s.sceneType ?? "ai_bg") === "ai_bg" && !s.imageUrl);

  console.log(`  생성할 씬: ${targets.length}개`);

  for (const { i } of targets) {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`  [씬 ${i + 1}] 생성 중... (시도 ${attempt + 1}/2)`);
        const result = await callApi("/api/admin/content/video-production/scene", {
          queueId: row.id,
          sceneIndex: i,
        });
        console.log(`  [씬 ${i + 1}] 완료: ${result.message}`);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`  [씬 ${i + 1}] 실패: ${err.message}`);
      }
    }
    if (lastErr) throw lastErr;
  }

  const result = await callApi("/api/admin/content/video-production/finalize", { queueId: row.id });
  console.log(`  ✅ ${result.message}`);
}

async function main() {
  let rows;
  if (TARGET_ID) {
    const { data, error } = await supabase
      .from("content_youtube_queue")
      .select("id, title, scenes")
      .eq("id", TARGET_ID)
      .single();
    if (error) throw error;
    rows = data ? [data] : [];
  } else {
    const { data, error } = await supabase
      .from("content_youtube_queue")
      .select("id, title, scenes")
      .eq("status", "producing")
      .order("updated_at", { ascending: true });
    if (error) throw error;
    rows = (data ?? []).filter(needsFlux);
  }

  if (rows.length === 0) {
    console.log("처리할 항목이 없습니다. 종료.");
    return;
  }

  console.log(`처리 대상: ${rows.length}건`);
  for (const row of rows) {
    try {
      await processItem(row);
    } catch (err) {
      console.error(`❌ ${row.id} 처리 실패:`, err.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
