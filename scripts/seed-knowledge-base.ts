/**
 * 에이전트 지식베이스(RAG) 시드 스크립트
 * 4개 패치를 8개 청크로 나눠 임베딩 후 knowledge_base 테이블에 삽입.
 *
 * Usage: npx tsx --env-file=.env.local scripts/seed-knowledge-base.ts
 */

import { createClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, ""),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

type Chunk = { source: string; title: string; content: string; category: string };

const CHUNKS: Chunk[] = [
  // ─── 패치1: 사업 정체성 ───────────────────────────────────────────────────────
  {
    source: "patch1",
    title: "브랜드 정체성 및 대표 프로필",
    category: "사업 정체성",
    content: `브랜드: 우리집 전기주치의(대경이엔피)
핵심 포지셔닝: "우리집 전기 주치의 — 전기기사가 직접 진단하고 처방합니다."
대표: 전기기사+전기공사기사 자격 보유, 아파트 전기팀장으로 풀타임 근무 중,
저녁/주말에만 사업 운영. 광주광역시 기반, 아파트 전기 안전 점검 및 화재 예방 전문.`,
  },

  // ─── 패치2: 법적 트랙 구조 ────────────────────────────────────────────────────
  {
    source: "patch2_tracks",
    title: "법적 서비스 트랙 구조 (Track A / B / C)",
    category: "법적 구조",
    content: `Track A: 직접 점검/진단/경미한 면제 작업 (전기기사 자격으로 가능한 범위)
Track B: 진단 후 면허 보유 시공업체 추천, 고객-시공업체 직접 계약
  (대경이엔피는 중개만, 시공 직접 수행 안 함 — 법적 책임 분리)
Track C: 향후 전기공사업 정식 등록 후 직접 시공까지 확장 (미래 계획)`,
  },
  {
    source: "patch2_exclusion",
    title: "영구 제외 원칙 — 이해충돌 방지",
    category: "법적 구조",
    content: `영구 제외 원칙: 본업(아파트 전기팀장)으로 관리 중인 아파트 단지는
이해충돌 방지를 위해 영구적으로 고객 풀에서 제외.`,
  },

  // ─── 패치3: 사업 전략/로드맵 ─────────────────────────────────────────────────
  {
    source: "patch3_revenue",
    title: "3개년 매출 목표",
    category: "사업 전략",
    content: `3개년 매출 목표: 1년차 5,000만원 / 2년차 2억5,000만원 / 3년차 7억5,000만원`,
  },
  {
    source: "patch3_year1",
    title: "1년차 전략 — 웹사이트 및 카카오톡 채널 운영",
    category: "사업 전략",
    content: `1년차 전략: dkansim.com은 신뢰도 도구(명함 대체)로 활용,
실제 예약/상담은 카카오톡 채널로 진행`,
  },
  {
    source: "patch3_growth",
    title: "직원 채용 시점, 법인 전환, 업종코드 추가 전략",
    category: "사업 전략",
    content: `직원 채용 시점: 월매출 500만원 초과 시점부터 고려
법인 전환 시점: 2년차부터 검토 (1년차는 개인사업자로 KIBO 창업기업
  우대보증 신청, 법인 전환 전이 유리)
업종코드 추가 권장: 소프트웨어 개발업(722) 추가하면 기술평가 점수 유리`,
  },

  // ─── 패치4: 특허 ─────────────────────────────────────────────────────────────
  {
    source: "patch4_basic",
    title: "특허 출원 기본 정보 (출원번호, 발명 개요)",
    category: "특허",
    content: `출원번호 4-2026-034423-8, 심사청구 완료
발명: URL 파라미터 기반 멀티테넌트 유지보수 서비스 플랫폼
총 14개 청구항.`,
  },
  {
    source: "patch4_modules",
    title: "특허 4개 모듈 상세 — 멀티테넌트/선결제/비용정산/보증서",
    category: "특허",
    content: `4개 모듈:
(110) 멀티테넌트 UI 매핑 — URL 파라미터로 아파트별 브랜드 UI를 동적 매핑
(120) 선결제 게이트웨이 로직 — 방문 전 선결제 흐름 제어
(130) 가변 필드 비용 정산 — 현장 추가 비용을 동적 필드로 정산
(140) 디지털 보증서 자동 발급 — 점검 완료 후 보증서 생성·발급`,
  },
];

async function main() {
  console.log("🧠 지식베이스 시드 시작");

  // 기존 데이터 초기화
  const { error: delErr } = await supabase.from("knowledge_base").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) {
    console.error("기존 데이터 삭제 실패:", delErr.message);
    process.exit(1);
  }
  console.log("기존 데이터 초기화 완료");

  let success = 0;
  let fail = 0;

  for (let i = 0; i < CHUNKS.length; i++) {
    const chunk = CHUNKS[i];
    process.stdout.write(`[${i + 1}/${CHUNKS.length}] 임베딩 중: "${chunk.title.slice(0, 40)}"...`);
    try {
      const embedding = await embedText(`${chunk.title}\n${chunk.content}`);
      const { error } = await supabase.from("knowledge_base").insert({
        source: chunk.source,
        title: chunk.title,
        content: chunk.content,
        category: chunk.category,
        embedding,
      });
      if (error) throw error;
      console.log(` ✅`);
      success++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(` ❌ ${msg}`);
      fail++;
    }

    // 레이트 리밋 방지
    if (i < CHUNKS.length - 1) await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n완료: ${success}/${CHUNKS.length} 성공 | ${fail} 실패`);

  // 삽입 확인
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("id, source, title, category")
    .order("created_at");
  if (!error && data) {
    console.log("\n삽입된 청크:");
    for (const row of data) {
      console.log(`  [${row.category}] ${row.source} — ${row.title.slice(0, 50)}`);
    }
  }

  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
