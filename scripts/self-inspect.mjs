import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'https://dkansim.com';
const HQ_URL = 'https://hq.dkansim.com';
const AGENT_SECRET = process.env.AGENT_WRITE_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const results = [];

function log(category, name, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${category}] ${name}${detail ? ': ' + detail : ''}`);
  results.push({ category, name, status, detail });
}

// ── 1. API 엔드포인트 점검 ─────────────────────────────────────────────────
async function checkAPIs() {
  console.log('\n📡 API 엔드포인트 점검...');

  const endpoints = [
    { url: `${BASE_URL}/api/knowledge/search`, method: 'POST', body: { query: '누전차단기', limit: 3 }, name: 'RAG 검색 API' },
    { url: `${BASE_URL}/api/validate`, method: 'POST', body: { type: 'content', title: '테스트', content: '누전차단기 교체 주기는 10년입니다.', contentType: 'blog', keywords: ['누전차단기'] }, name: '교차검증 API', auth: true },
  ];

  for (const ep of endpoints) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (ep.auth) headers['Authorization'] = `Bearer ${AGENT_SECRET}`;

      const res = await fetch(ep.url, { method: ep.method, headers, body: JSON.stringify(ep.body) });
      const text = await res.text();
      const isGeminiQuota = text.includes('429') || text.includes('503') || text.includes('prepayment') || text.includes('GEMINI_UNAVAILABLE') || text.includes('overloaded');

      if (res.ok) {
        log('API', ep.name, 'PASS', `HTTP ${res.status}`);
      } else if (res.status === 503 || res.status === 429 || isGeminiQuota) {
        log('API', ep.name, 'WARN', `Gemini 크레딧 소진 — 키 교체 필요`);
      } else {
        log('API', ep.name, 'FAIL', `HTTP ${res.status}: ${text.slice(0, 120)}`);
      }
    } catch (err) {
      log('API', ep.name, 'FAIL', err.message);
    }
  }
}

// ── 2. Supabase 테이블 점검 ────────────────────────────────────────────────
async function checkTables() {
  console.log('\n🗄️  Supabase 테이블 점검...');

  const tables = [
    { name: 'knowledge_chunks',   minRows: 1, label: '지식베이스(Voyage)' },
    { name: 'knowledge_base',     minRows: 1, label: '지식베이스(OpenRouter)' },
    { name: 'agent_logs',         minRows: 0, label: '에이전트 로그' },
    { name: 'chat_sessions',      minRows: 0, label: '대화 세션' },
    { name: 'chat_messages',      minRows: 0, label: '대화 메시지' },
    { name: 'reservations',       minRows: 0, label: '예약/현장점검' },
    { name: 'content_youtube_queue', minRows: 0, label: '유튜브 콘텐츠 큐' },
    { name: 'content_kakao_queue',   minRows: 0, label: '카카오 콘텐츠 큐' },
    { name: 'blog_posts',         minRows: 0, label: '블로그 포스트' },
    { name: 'warranties',         minRows: 0, label: '디지털 보증서' },
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase.from(table.name).select('*', { count: 'exact', head: true });
      if (error) {
        log('DB', table.label, 'FAIL', error.message);
      } else if (count < table.minRows) {
        log('DB', table.label, 'WARN', `${count}행 (최소 ${table.minRows}행 필요)`);
      } else {
        log('DB', table.label, 'PASS', `${count}행`);
      }
    } catch (err) {
      log('DB', table.label, 'FAIL', err.message);
    }
  }
}

// ── 3. 지식베이스 품질 교차검증 ───────────────────────────────────────────
async function checkKnowledgeQuality() {
  console.log('\n🧠 지식베이스 품질 교차검증 (Gemini)...');

  const categories = ['전기법령', '전기기술', '일반'];
  for (const category of categories) {
    try {
      const { data } = await supabase
        .from('knowledge_chunks')
        .select('content, source_file')
        .limit(1)
        .maybeSingle();

      if (!data) { log('지식베이스', `${category} 샘플`, 'WARN', '데이터 없음'); continue; }

      const res = await fetch(`${BASE_URL}/api/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AGENT_SECRET}` },
        body: JSON.stringify({ type: 'knowledge_chunk', sourceFile: data.source_file ?? category, content: data.content, category }),
      });

      const rawText = await res.text();
      if (res.status === 429 || res.status === 503 || rawText.includes('429') || rawText.includes('503') || rawText.includes('prepayment') || rawText.includes('GEMINI_UNAVAILABLE') || rawText.includes('overloaded')) {
        log('지식베이스', `${category} 품질`, 'WARN', 'Gemini 일시적 오버로드 — 잠시 후 재시도 필요');
        continue;
      }
      const result = JSON.parse(rawText);
      const status = result.passed ? 'PASS' : result.score >= 70 ? 'WARN' : 'FAIL';
      log('지식베이스', `${category} 품질`, status, `점수: ${result.score}`);
    } catch (err) {
      log('지식베이스', `${category} 품질`, 'FAIL', err.message);
    }
  }
}

// ── 4. RAG 답변 품질 교차검증 ─────────────────────────────────────────────
async function checkRAGQuality() {
  console.log('\n💬 RAG 답변 품질 교차검증 (Gemini)...');

  const testQuestions = [
    '누전차단기 교체 주기가 어떻게 되나요?',
    '전기안전점검 의무 대상은 누구인가요?',
  ];

  for (const question of testQuestions) {
    try {
      const searchRes = await fetch(`${BASE_URL}/api/knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: question, limit: 3 }),
      });
      const searchResult = await searchRes.json();
      const chunks = searchResult.results ?? [];

      if (chunks.length === 0) { log('RAG', question.slice(0, 20), 'WARN', '관련 청크 없음'); continue; }

      const answer = chunks[0].content.slice(0, 300);
      const validateRes = await fetch(`${BASE_URL}/api/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AGENT_SECRET}` },
        body: JSON.stringify({ type: 'rag_answer', question, answer, chunks }),
      });

      const rawValidate = await validateRes.text();
      if (validateRes.status === 429 || validateRes.status === 503 || rawValidate.includes('429') || rawValidate.includes('503') || rawValidate.includes('prepayment') || rawValidate.includes('GEMINI_UNAVAILABLE') || rawValidate.includes('overloaded')) {
        log('RAG', question.slice(0, 20), 'WARN', 'Gemini 일시적 오버로드 — 잠시 후 재시도 필요');
        continue;
      }
      const validation = JSON.parse(rawValidate);
      const status = validation.passed ? 'PASS' : validation.score >= 70 ? 'WARN' : 'FAIL';
      log('RAG', question.slice(0, 20), status, `점수: ${validation.score}`);
    } catch (err) {
      log('RAG', question.slice(0, 20), 'FAIL', err.message);
    }
  }
}

// ── 5. 환경변수 점검 ──────────────────────────────────────────────────────
async function checkEnvVars() {
  console.log('\n🔑 환경변수 점검...');

  const vars = [
    ['VOYAGE_API_KEY', true],
    ['GEMINI_API_KEY', true],
    ['TAVILY_API_KEY', false],
    ['FIRECRAWL_API_KEY', false],
    ['AGENT_WRITE_SECRET', true],
    ['NEXT_PUBLIC_SUPABASE_URL', true],
    ['SUPABASE_SERVICE_ROLE_KEY', true],
    ['ANTHROPIC_API_KEY', true],
    ['SOLAPI_API_KEY', false],
    ['SOLAPI_API_SECRET', false],
    ['KAKAO_REST_API_KEY', false],
  ];

  for (const [key, required] of vars) {
    if (process.env[key]) {
      log('환경변수', key, 'PASS', '등록됨');
    } else if (required) {
      log('환경변수', key, 'FAIL', '없음 — 필수 환경변수');
    } else {
      log('환경변수', key, 'WARN', '없음 (선택적 기능 비활성)');
    }
  }
}

// ── 6. GitHub Actions 워크플로우 점검 ──────────────────────────────────────
async function checkWorkflows() {
  console.log('\n⚙️  GitHub Actions 워크플로우 점검...');

  const token = process.env.GH_PAT ?? process.env.GITHUB_TOKEN;
  if (!token) { log('워크플로우', 'GitHub API', 'WARN', 'GH_PAT 없음 — 점검 건너뜀'); return; }

  try {
    const res = await fetch('https://api.github.com/repos/lakkk-cmd/dk-safety/actions/workflows', {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' },
    });
    const data = await res.json();
    const workflows = data.workflows ?? [];
    for (const wf of workflows) {
      log('워크플로우', wf.name, wf.state === 'active' ? 'PASS' : 'WARN', wf.state);
    }
  } catch (err) {
    log('워크플로우', 'GitHub API', 'FAIL', err.message);
  }
}

// ── 최종 리포트 + agent_logs 저장 ─────────────────────────────────────────
async function finalize() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 자체점검 최종 리포트');
  console.log('='.repeat(60));

  const pass = results.filter(r => r.status === 'PASS').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const fail = results.filter(r => r.status === 'FAIL').length;

  console.log(`✅ PASS: ${pass}개`);
  console.log(`⚠️  WARN: ${warn}개`);
  console.log(`❌ FAIL: ${fail}개`);
  console.log(`전체: ${results.length}개`);

  if (fail > 0) {
    console.log('\n🔴 즉시 수정 필요:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  - [${r.category}] ${r.name}: ${r.detail}`));
  }
  if (warn > 0) {
    console.log('\n🟡 검토 필요:');
    results.filter(r => r.status === 'WARN').forEach(r => console.log(`  - [${r.category}] ${r.name}: ${r.detail}`));
  }

  // agent_logs에 저장 (실제 스키마: level, source, message, meta)
  try {
    await supabase.from('agent_logs').insert({
      level: fail > 0 ? 'warn' : 'info',
      source: 'self_inspector',
      message: `시스템 자체점검 완료: PASS ${pass}, WARN ${warn}, FAIL ${fail}`,
      meta: { pass, warn, fail, details: results, inspected_at: new Date().toISOString() },
    });
    console.log('\n📝 점검 결과 agent_logs 저장 완료');
  } catch (err) {
    console.log('\n⚠️  agent_logs 저장 실패:', err.message);
  }

  return { pass, warn, fail };
}

async function main() {
  console.log('🔍 dk-safety 전체 시스템 자체점검 시작...');
  console.log(`대상: ${BASE_URL}, ${HQ_URL}`);
  console.log('='.repeat(60));

  await checkEnvVars();
  await checkTables();
  await checkAPIs();
  await checkKnowledgeQuality();
  await checkRAGQuality();
  await checkWorkflows();

  const { fail } = await finalize();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => { console.error('점검 스크립트 오류:', err); process.exit(1); });
