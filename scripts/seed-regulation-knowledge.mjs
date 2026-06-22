/** KEC/전기안전관리법 규정 지식베이스 시드 — category='regulation', knowledge_base 테이블에 임베딩과 함께 저장 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require" });

const REGULATION_CHUNKS = [
  {
    source: "KEC 210",
    title: "KEC 210 저압 옥내배선 — 전선 굵기·허용전류·보호방식",
    content:
      "한국전기설비규정(KEC) 210은 저압 옥내배선의 일반 원칙을 규정한다. 전선의 굵기는 사용전류, 전압강하, 단락보호 협조를 고려해 선정해야 하며, 주택 분기회로는 일반적으로 2.5㎟ 이상의 연동선을 사용한다. 배선은 합성수지관·금속관·케이블 공사 등 시설장소의 환경(습기, 화재위험)에 맞는 공사방법을 선택해야 하며, 모든 옥내 배선은 과전류차단기로 보호되어야 한다. 절연피복이 劣化된 노후 배선(통상 15~20년 이상 사용)은 누전·단락 위험이 커지므로 정기점검 시 우선 확인 대상이다."
  },
  {
    source: "KEC 212",
    title: "KEC 212 배선의 허용전류 — 과부하 판단 기준",
    content:
      "KEC 212는 전선이 연속적으로 흘릴 수 있는 최대 전류(허용전류) 산정 기준을 규정한다. 허용전류는 전선의 굵기, 절연체 종류, 공사방법(관 내 배선/노출배선), 주위온도, 동일 관 내 전선 수에 따른 보정계수를 적용해 산정한다. 실제 부하전류가 전선의 허용전류를 초과한 상태가 지속되면 과부하로 판단하며, 전선 피복 온도 상승 → 절연 劣化 → 단락·화재로 이어질 수 있다. 분전반 차단기 용량(20·30·40·50·60·75·100A)이 해당 분기 전선의 허용전류를 넘지 않도록 설계되어야 하며, 두 값이 불일치하면 과부하 보호가 무력화된다."
  },
  {
    source: "KEC 232",
    title: "KEC 232 콘센트 시설 기준 — 접지형·방우형·설치 높이",
    content:
      "KEC 232는 콘센트의 시설 기준을 정한다. 주택 내 콘센트는 원칙적으로 접지극이 있는 접지형 콘센트를 사용해야 하며, 욕실·세탁실 등 물기가 있는 장소에는 방우형(방적형) 콘센트와 누전차단기를 함께 설치해야 한다. 설치 높이는 바닥에서 약 30㎝ 이상을 기본으로 하며, 영유아 안전을 고려한 잠금장치형 콘센트가 권장된다. 콘센트 접지선이 분리·단선되어 있으면 누전 시 인체로 전류가 흐를 위험이 커지므로, 접지 연결 상태(정상/불량/미확인)는 현장 점검 시 필수 확인 항목이다."
  },
  {
    source: "KEC 234",
    title: "KEC 234 누전차단기 — 주거용 정격감도전류 30mA 이하 의무",
    content:
      "KEC 234는 누전차단기(ELB/RCD) 설치 의무를 규정한다. 주택 등 일반 옥내 전로에는 정격감도전류 30mA 이하, 동작시간 0.03초 이내의 고감도 고속형 누전차단기를 설치해야 한다. 이는 인체 감전 시 심실세동 등 치명적 사고를 방지하기 위한 최소 기준이다. 욕실 등 습기가 많은 장소나 옥외 콘센트에는 더 엄격한 기준이 적용될 수 있다. 현장 점검에서 측정한 누전차단기 동작 전류가 30mA를 초과하거나 테스트 버튼 작동 시 차단되지 않으면 즉시 교체 대상이다."
  },
  {
    source: "전기안전관리법 시행규칙",
    title: "전기안전관리법 시행규칙 — 세대 전기설비 자체점검 기준",
    content:
      "전기안전관리법 및 시행규칙은 전기설비의 정기적인 자체점검·정밀점검 의무를 규정한다. 공동주택 등 다중이 거주하는 시설은 일정 주기로 전기설비 안전점검을 실시해야 하며, 점검 결과 절연저항 부족·누전·과부하 등 위험 요소가 발견되면 지체없이 보수·교체해야 한다. 세대 내 전기설비는 입주자 개인 책임 영역이지만, 분전반·공용배선 등은 관리주체(관리사무소)의 점검 의무 대상에 포함되는 경우가 많다. 점검 기록은 일정 기간 보관해야 하며, 중대한 결함을 방치해 사고가 발생하면 관리 책임이 발생할 수 있다."
  },
  {
    source: "공동주택 화재통계",
    title: "공동주택 화재 원인 TOP5 (아크/절연불량/과부하/접촉불량/누전) 및 계측 판단 기준값",
    content:
      "공동주택 전기화재의 주요 원인은 ① 아크(접속부 불량으로 인한 스파크), ② 절연불량(절연저항 1MΩ 미만), ③ 과부하(부하전류가 허용전류 초과), ④ 접촉불량(콘센트·차단기 단자 풀림·산화), ⑤ 누전(절연 劣化로 전류가 의도되지 않은 경로로 흐름)이다. 판단 기준값으로는 절연저항 1MΩ 이상을 정상, 미달 시 절연불량으로 판정하며, 누전차단기 동작전류 30mA 이하를 정상으로 본다. 콘센트·배선의 과열흔적(변색, 탄화)이 관찰되면 접촉불량 또는 과부하가 진행 중일 가능성이 높아 즉시 부하 분산 또는 부품 교체가 필요하다."
  },
  {
    source: "제조사 권장기준",
    title: "차단기/콘센트 교체 권장 연한 (15~20년, 제조사 공통 기준)",
    content:
      "배선용 차단기, 누전차단기, 콘센트 등 전기설비 부품은 통상 제조 후 15~20년을 교체 권장 주기로 본다. 내부 스프링·접점의 기계적 劣화와 절연재의 노후화로 차단 성능과 절연 성능이 저하되기 때문이다. 제조연도가 15년을 초과한 차단기는 정상 동작 여부와 무관하게 예방적 교체를 권고하며, 20년을 초과하면 교체 필요로 판정한다. 콘센트는 외관상 균열·변색·헐거움이 있으면 연식과 무관하게 즉시 교체 대상이다."
  }
];

async function embedText(text) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY가 필요합니다.");
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text.slice(0, 8000) })
  });
  if (!res.ok) throw new Error(`임베딩 API 오류 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const embedding = json.data?.[0]?.embedding;
  if (!embedding || embedding.length !== 1536) throw new Error("임베딩 응답 형식이 올바르지 않습니다.");
  return embedding;
}

async function main() {
  let saved = 0;
  for (const chunk of REGULATION_CHUNKS) {
    const embedding = await embedText(chunk.content);
    const vectorLiteral = `[${embedding.join(",")}]`;
    await sql`
      insert into knowledge_base (source, title, content, embedding, category, is_external)
      values (${chunk.source}, ${chunk.title}, ${chunk.content}, ${vectorLiteral}, 'regulation', false)
    `;
    saved += 1;
    console.log(`saved: ${chunk.title}`);
  }
  console.log(`done: ${saved}/${REGULATION_CHUNKS.length} chunks saved`);
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
