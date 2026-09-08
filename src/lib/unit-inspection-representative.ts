/**
 * 세대방문점검이 세대미방문 간이점검보다 항상 우선한다는 정책(2026-09-08)의 순수 판정 로직.
 * 원본 데이터/DB는 절대 건드리지 않는다 — "이 세대의 지금 시점 대표기록이 뭐냐"는 조회할 때마다
 * 계산하는 값이고, 서버(admin/apt-manager API)와 클라이언트(관리자·전기과장 화면)가 같은 규칙을
 * 쓰도록 여기 한 곳에 둔다. 서버 전용 의존성(Supabase 등)이 전혀 없어 "use client" 컴포넌트에서
 * 바로 import해도 안전하다.
 *
 * 규칙: 한 세대(동/호)의 기록들 중 가장 최근 "달력연도"에 속한 그룹만 본다(해가 지나면 그 이전
 * 해의 판정은 리셋). 그 그룹 안에 세대방문점검(visit)이 하나라도 있으면 순서 무관하게 방문점검이
 * 대표가 되고, 여러 건이면 그중 가장 최근 것을 고른다. 방문점검이 하나도 없으면 그 그룹에서
 * 가장 최근 기록(간이점검)이 대표다.
 */

export type RepresentativeInspectionInput = {
  id: string;
  inspectionType: "visit" | "unvisited_simple";
  inspectedAt: string;
};

function yearOf(iso: string): number {
  return new Date(iso).getFullYear();
}

/** 같은 세대의 기록 목록에서 "지금 시점의 대표기록"을 고른다. records는 비어있으면 안 된다. */
export function pickRepresentativeInspection<T extends RepresentativeInspectionInput>(records: T[]): T {
  if (records.length === 0) {
    throw new Error("pickRepresentativeInspection: records must not be empty");
  }
  const latestYear = Math.max(...records.map((r) => yearOf(r.inspectedAt)));
  const yearGroup = records.filter((r) => yearOf(r.inspectedAt) === latestYear);
  const visits = yearGroup.filter((r) => r.inspectionType === "visit");
  const pool = visits.length > 0 ? visits : yearGroup;
  return pool.reduce((best, cur) => (new Date(cur.inspectedAt).getTime() > new Date(best.inspectedAt).getTime() ? cur : best));
}

/**
 * 대표기록과 같은 연도 그룹 안에 있으면서 대표로 뽑히지 못해 "밀려난" 기록들의 id.
 * 지난 연도 기록은 밀려난 게 아니라 그냥 지나간 이력이므로 포함하지 않는다.
 */
export function pickSupersededIdsInCurrentYear<T extends RepresentativeInspectionInput>(records: T[]): Set<string> {
  if (records.length === 0) return new Set();
  const representative = pickRepresentativeInspection(records);
  const repYear = yearOf(representative.inspectedAt);
  return new Set(
    records.filter((r) => yearOf(r.inspectedAt) === repYear && r.id !== representative.id).map((r) => r.id)
  );
}

/** PDF 다운로드 할당량 언락 여부를 "이 세대 이 연도" 단위로 물려주기 위한 대상 id 목록. */
export function representativeYearGroupIds<T extends RepresentativeInspectionInput>(records: T[]): string[] {
  if (records.length === 0) return [];
  const representative = pickRepresentativeInspection(records);
  const repYear = yearOf(representative.inspectedAt);
  return records.filter((r) => yearOf(r.inspectedAt) === repYear).map((r) => r.id);
}
