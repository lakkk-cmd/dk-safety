/**
 * 광주광역시 대표 아파트 단지 20곳을 apartments 테이블에 시드한다 — "서비스 가능 지역"으로
 * 노출할 목적(실제 계약/제휴 단지가 아님 — 이미 등록된 신안한국아델리움/유나이티드힐스테이트3단지만
 * 실고객). code가 이미 있으면 건너뛴다(재실행 안전).
 *
 * Usage: npx tsx --env-file=.env.local scripts/seed-gwangju-apartments.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, ""),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

type ApartmentSeed = { name: string; code: string; district: string };

const APARTMENTS: ApartmentSeed[] = [
  // 동구
  { name: "무등산아이파크", code: "mudeung", district: "동구" },
  { name: "학동롯데캐슬골드파크", code: "hakdong", district: "동구" },
  // 서구
  { name: "상무센트럴자이", code: "sangmujai", district: "서구" },
  { name: "중앙공원롯데캐슬시그니처", code: "jungangpark", district: "서구" },
  { name: "유니버시아드힐스테이트", code: "uhills", district: "서구" },
  { name: "광천동코오롱하늘채", code: "gwangcheon", district: "서구" },
  // 남구
  { name: "봉선제일풍경채엘리트파크", code: "bongseon1", district: "남구" },
  { name: "e편한세상봉선셀레스티지", code: "bongseon2", district: "남구" },
  { name: "송암공원중흥S클래스", code: "songam", district: "남구" },
  { name: "진월더리브라포레", code: "jinwol", district: "남구" },
  // 북구
  { name: "힐스테이트첨단센트럴", code: "cheomdan", district: "북구" },
  { name: "일곡공원위파크", code: "ilgok", district: "북구" },
  { name: "운암산롯데캐슬", code: "unam", district: "북구" },
  { name: "중외공원힐스테이트", code: "jungoe", district: "북구" },
  { name: "오치제일풍경채", code: "ochi", district: "북구" },
  // 광산구
  { name: "수완우미린", code: "suwan", district: "광산구" },
  { name: "첨단광신프로그레스", code: "gwangsin", district: "광산구" },
  { name: "한양립스에듀포레", code: "hanyang", district: "광산구" },
  { name: "신가롯데캐슬", code: "singa", district: "광산구" },
  { name: "하남산단진흥더루벤스", code: "hanam", district: "광산구" },
];

async function main() {
  console.log(`광주 아파트 시드 시작 (${APARTMENTS.length}곳)`);
  let inserted = 0;
  let skipped = 0;

  for (const apt of APARTMENTS) {
    const { data: existing } = await supabase
      .from("apartments")
      .select("id")
      .eq("code", apt.code)
      .maybeSingle();
    if (existing) {
      console.log(`  건너뜀(이미 존재): ${apt.name} (${apt.code})`);
      skipped++;
      continue;
    }
    // apartments 테이블에 code/apt_code/apt_id, name/apt_name이 전부 NOT NULL로 중복 존재
    // (여러 시대 마이그레이션이 겹쳐 쌓인 상태) — 어느 컬럼을 읽는 코드경로든 맞도록 동일하게 채운다.
    const { error } = await supabase.from("apartments").insert({
      name: apt.name,
      apt_name: apt.name,
      code: apt.code,
      apt_code: apt.code,
      apt_id: apt.code
    });
    if (error) {
      console.error(`  실패: ${apt.name} (${apt.code}) — ${error.message}`);
      continue;
    }
    console.log(`  추가됨: [${apt.district}] ${apt.name} (${apt.code})`);
    inserted++;
  }

  console.log(`\n완료: ${inserted}곳 추가, ${skipped}곳 건너뜀`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
