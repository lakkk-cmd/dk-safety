/**
 * dk-blog-factory 4단계: 블로그 제작 파이프라인 (워커 측)
 * queued → researching(키워드 조사) → drafting(Claude 원고 + 검증 루프)
 *        → processing_images(사진 보정 + 썸네일) → pending_review
 *
 * 발행은 절대 이 워커의 역할이 아니다 — 대장이 hq 발행 패키지 화면에서
 * 네이버 에디터에 수동으로 붙여넣는다 (자동 발행 = 네이버 정책 위반).
 */
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getKeywordStats } from "./lib/naver-keywords.mjs";
import { processPhoto } from "./lib/image-process.mjs";
import { generateThumbnail, THUMBNAIL_TEMPLATES } from "./lib/thumbnail.mjs";
import { uploadToStorage, toPublicUrl } from "./lib/storage.mjs";
import { extractJsonBlock } from "./script-gen.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_BUCKET = "blog-assets";
const OUT_DIR = path.join(__dirname, "out", "blog-jobs");

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
const DRAFT_MAX_TOKENS = 12000; // 2-3천자 원고 + JSON 오버헤드 (잘림 방지)
const VALIDATION_PASS_SCORE = 80;

let writerPromptCache = null;
function getWriterPrompt() {
  writerPromptCache ??= readFileSync(path.join(__dirname, "blog-writer-system-prompt.md"), "utf8");
  return writerPromptCache;
}

async function callClaude({ system, user, maxTokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 없습니다.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function parseJsonReply(text, label) {
  const jsonText = extractJsonBlock(text);
  if (!jsonText) throw new Error(`${label} 응답에서 JSON을 찾지 못했습니다`);
  return JSON.parse(jsonText);
}

// ─── 1) 키워드 조사 ────────────────────────────────────────────────────────────

/** 조회수 500~5,000 + 경쟁 낮음/중간 우선 (초기 블로그 지수 고려), §3-1 */
export function pickKeywords(allKeywords) {
  const preferred = allKeywords
    .filter((k) => k.monthlyTotal >= 500 && k.monthlyTotal <= 5000 && ["낮음", "중간"].includes(k.competition))
    .sort((a, b) => b.monthlyTotal - a.monthlyTotal);
  const fallback = [...allKeywords].sort((a, b) => b.monthlyTotal - a.monthlyTotal);
  const ranked = preferred.length > 0 ? preferred : fallback;
  const main = ranked[0];
  const sub = ranked.slice(1, 6).filter((k) => k.keyword !== main?.keyword);
  const questions = allKeywords
    .filter((k) => /방법|원인|비용|교체|어떻게|왜/.test(k.keyword))
    .slice(0, 5)
    .map((k) => k.keyword);
  return { main, sub, questions };
}

async function researchKeywords(job) {
  const seeds = job.seed_keywords?.length ? job.seed_keywords : [job.topic];
  const { source, keywords } = await getKeywordStats(seeds);
  const { main, sub, questions } = pickKeywords(keywords);
  if (!main) throw new Error("키워드 조사 결과가 비어 있습니다");
  return {
    source,
    main: main.keyword,
    volume: main.monthlyTotal,
    competition: main.competition,
    sub: sub.map((k) => ({ keyword: k.keyword, volume: k.monthlyTotal, competition: k.competition })),
    questions,
    candidates_total: keywords.length,
  };
}

// ─── 2) RAG (knowledge_chunks ILIKE 검색) ──────────────────────────────────────

async function searchEvidence(sql, terms, maxChunks = 6) {
  const seen = new Set();
  const chunks = [];
  for (const term of terms.filter(Boolean)) {
    if (chunks.length >= maxChunks) break;
    const rows = await sql`
      select id, source_file, content from knowledge_chunks
      where content ilike ${"%" + term + "%"}
      order by chunk_index limit 3`;
    for (const row of rows) {
      if (seen.has(row.id) || chunks.length >= maxChunks) continue;
      seen.add(row.id);
      chunks.push({ source: row.source_file, content: String(row.content).slice(0, 600) });
    }
  }
  return chunks;
}

// ─── 3) 원고 생성 + 검증 루프 ──────────────────────────────────────────────────

function validateDraftShape(draft) {
  if (!draft?.title?.trim()) throw new Error("원고 형식 오류: title 누락");
  if (!Array.isArray(draft.sections) || draft.sections.length < 3) {
    throw new Error("원고 형식 오류: sections 3개 미만");
  }
  for (const [i, s] of draft.sections.entries()) {
    if (!s.heading?.trim() || !s.body?.trim()) throw new Error(`원고 형식 오류: sections[${i}] heading/body 누락`);
  }
  if (!Array.isArray(draft.tags) || draft.tags.length === 0) throw new Error("원고 형식 오류: tags 누락");
  return draft;
}

const VALIDATION_SYSTEM_PROMPT = `당신은 네이버 블로그 원고 검증 전문가입니다. 아래 원고를 4가지 기준으로 점검해 0~100점과 지적 사항을 매기십시오.

기준:
(a) 기술적 정확성 — 전기 안전 정보가 참고 자료와 모순되거나 위험한 안내가 없는가 (가장 중요, 위반 시 큰 감점)
(b) 키워드 배치 자연스러움 — 메인 키워드 본문 5-7회 이내, 스터핑/부자연스러운 반복 여부
(c) 법적 표현 준수 — "예방됩니다" 같은 단정 대신 "위험을 줄일 수 있습니다"류 책임 있는 표현인가, 과장 광고성 문구는 없는가
(d) 양산형 패턴 여부 — AI 티가 나는 기계적 구성/상투어("오늘은 ~에 대해 알아보겠습니다" 남발 등) 여부

주제 무관성은 감점 사유가 아닙니다. 반드시 JSON만 출력:
{"score": 0-100, "issues": ["구체적 지적과 수정 방향", ...]}`;

async function draftWithValidation(job, keywordResearch, evidence, log) {
  const evidenceBlock =
    evidence.length > 0
      ? evidence.map((c, i) => `[참고${i + 1}: ${c.source}]\n${c.content}`).join("\n\n")
      : "(참고 자료 없음 — KEC 조항/법령/통계 인용 금지)";
  const imagesBlock = job.raw_image_paths?.length
    ? `raw_images: ${job.raw_image_paths.length}장 (${job.raw_image_paths.map((p) => path.basename(p)).join(", ")})`
    : "raw_images: 없음";

  const userMessage = `topic: ${job.topic}

keyword_research:
${JSON.stringify(keywordResearch, null, 2)}

참고 자료:
${evidenceBlock}

${imagesBlock}

위 입력으로 원고 JSON을 작성하라.`;

  let draft = validateDraftShape(parseJsonReply(await callClaude({
    system: getWriterPrompt(), user: userMessage, maxTokens: DRAFT_MAX_TOKENS,
  }), "원고"));

  const attempts = [];
  for (let round = 1; round <= 2; round++) {
    const verdict = parseJsonReply(await callClaude({
      system: VALIDATION_SYSTEM_PROMPT,
      user: `참고 자료:\n${evidenceBlock}\n\n원고:\n${JSON.stringify(draft, null, 2)}`,
      maxTokens: 2000,
    }), "검증");
    const score = Number(verdict.score) || 0;
    const issues = Array.isArray(verdict.issues) ? verdict.issues : [];
    attempts.push({ round, score, issues });
    log(`  검증 ${round}차: ${score}점${issues.length ? ` — 지적 ${issues.length}건` : ""}`);

    if (score >= VALIDATION_PASS_SCORE || round === 2) {
      return { draft, validation: { score, issues, attempts } };
    }
    // 80점 미만 → 지적 사항 반영해 1회 수정 후 재검증
    log(`  ${VALIDATION_PASS_SCORE}점 미만 — 지적 사항 반영해 수정`);
    draft = validateDraftShape(parseJsonReply(await callClaude({
      system: getWriterPrompt(),
      user: `${userMessage}\n\n이전 원고:\n${JSON.stringify(draft, null, 2)}\n\n검증 지적 사항 (반드시 반영해 전체 원고 JSON을 다시 출력):\n${issues.map((s) => `- ${s}`).join("\n")}`,
      maxTokens: DRAFT_MAX_TOKENS,
    }), "수정 원고"));
  }
  throw new Error("unreachable");
}

// ─── 4) 사진 보정 + 썸네일 ─────────────────────────────────────────────────────

async function processJobImages(job, draft, log) {
  const jobDir = path.join(OUT_DIR, job.id);
  mkdirSync(jobDir, { recursive: true });

  const processedUrls = [];
  const rawPaths = job.raw_image_paths ?? [];
  for (let i = 0; i < rawPaths.length; i++) {
    const srcUrl = toPublicUrl(BLOG_BUCKET, rawPaths[i]);
    const res = await fetch(srcUrl);
    if (!res.ok) throw new Error(`원본 사진 다운로드 실패 ${res.status}: ${srcUrl}`);
    const localPath = path.join(jobDir, `photo-${i + 1}.jpg`);
    const r = await processPhoto(Buffer.from(await res.arrayBuffer()), localPath);
    const url = await uploadToStorage({
      bucket: BLOG_BUCKET,
      objectPath: `blog-jobs/${job.id}/photo-${i + 1}.jpg`,
      body: await readFile(localPath),
      contentType: "image/jpeg",
    });
    processedUrls.push(url);
    log(`  사진 ${i + 1}/${rawPaths.length} 보정 완료 (${r.width}x${r.height}, 밝기 x${r.brightnessLift.toFixed(2)})`);
  }

  const template = THUMBNAIL_TEMPLATES.includes(draft.meta?.thumbnail_template)
    ? draft.meta.thumbnail_template
    : "info";
  const thumbLocal = path.join(jobDir, "thumbnail.png");
  await generateThumbnail({ title: draft.meta?.thumbnail_title || draft.title, template }, thumbLocal);
  const thumbnailUrl = await uploadToStorage({
    bucket: BLOG_BUCKET,
    objectPath: `blog-jobs/${job.id}/thumbnail.png`,
    body: await readFile(thumbLocal),
    contentType: "image/png",
  });
  log(`  썸네일 생성 완료 (${template})`);
  return { processedUrls, thumbnailUrl };
}

// ─── 파이프라인 진입점 ─────────────────────────────────────────────────────────

/** queued 블로그 잡 1건을 원자적으로 선점 (researching으로 전환) */
export async function claimNextBlogJob(sql) {
  const rows = await sql`
    update blog_jobs set status = 'researching'
    where id = (
      select id from blog_jobs where status = 'queued' order by created_at asc limit 1
    )
    returning *`;
  return rows[0] ?? null;
}

/** 잡 1건 전체 처리 — 호출부(index.mjs)가 재시도/error 기록을 감싼다 */
export async function runBlogJob(sql, job, log) {
  await sql`update blog_jobs set status = 'researching', error = null where id = ${job.id}`;
  log(`  키워드 조사 시작 (시드: ${(job.seed_keywords ?? [job.topic]).join(", ")})`);
  const keywordResearch = await researchKeywords(job);
  log(`  메인 키워드: "${keywordResearch.main}" (월 ${keywordResearch.volume}회, 경쟁 ${keywordResearch.competition}, ${keywordResearch.source})`);
  await sql`update blog_jobs set keyword_research = ${sql.json(keywordResearch)}, status = 'drafting' where id = ${job.id}`;

  const evidence = await searchEvidence(sql, [
    keywordResearch.main,
    ...keywordResearch.sub.slice(0, 2).map((s) => s.keyword),
    job.topic,
  ]);
  log(`  참고 자료 ${evidence.length}건 검색됨 (knowledge_chunks)`);

  const { draft, validation } = await draftWithValidation(job, keywordResearch, evidence, log);
  const charCount = draft.sections.reduce((n, s) => n + s.body.length, 0);
  log(`  원고 완성: "${draft.title}" (본문 ${charCount}자, 검증 ${validation.score}점)`);
  await sql`
    update blog_jobs set draft = ${sql.json(draft)}, validation = ${sql.json(validation)},
      status = 'processing_images'
    where id = ${job.id}`;

  const { processedUrls, thumbnailUrl } = await processJobImages(job, draft, log);
  await sql`
    update blog_jobs set
      processed_images = ${processedUrls},
      thumbnail_url = ${thumbnailUrl},
      status = 'pending_review',
      error = null
    where id = ${job.id}`;
  log(`  완료 → pending_review (발행 패키지 준비됨)`);
  await notifyBlogReview(job.id, log);
}

/** 발행 패키지 완성 카카오 알림 — 프로덕션 API가 대신 발송 (실패해도 잡 처리는 성공 유지) */
async function notifyBlogReview(jobId, log) {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://dkansim.com").replace(/\/$/, "");
  if (!secret) {
    log("  검토 알림 생략 (AGENT_WRITE_SECRET 미설정)");
    return;
  }
  try {
    const res = await fetch(`${base}/api/blog-jobs/notify-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ jobId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) log("  발행 요청 카카오 알림 발송 완료");
    else log(`  검토 알림 실패 (비치명): ${res.status} ${JSON.stringify(data).slice(0, 150)}`);
  } catch (e) {
    log(`  검토 알림 실패 (비치명): ${e?.message ?? String(e)}`);
  }
}
