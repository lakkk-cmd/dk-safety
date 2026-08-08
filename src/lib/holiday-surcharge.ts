/**
 * 출장비 휴일 할증 — 토/일요일 및 법정공휴일(대체공휴일 포함)에 방문하는 예약에
 * 기본 출장비의 20%를 가산한다. 채널(온라인/전화/현장즉시접수) 구분 없이 단일가 +
 * 휴일할증 체계로 통일(2026-08).
 *
 * 공휴일 목록은 매년 수작업으로 갱신해야 한다(음력 기반 명절 등 자동계산이 어려움).
 * 제헌절 부활, 특정 연도의 선거일 임시공휴일 지정 여부는 공식 확정 전이라 제외했다.
 */
const KR_HOLIDAYS_2026 = new Set<string>([
  "2026-01-01", // 신정
  "2026-02-16", "2026-02-17", "2026-02-18", // 설날 연휴
  "2026-03-01", "2026-03-02", // 삼일절 + 대체공휴일
  "2026-05-05", // 어린이날
  "2026-05-24", "2026-05-25", // 부처님오신날 + 대체공휴일
  "2026-06-06", // 현충일
  "2026-08-15", "2026-08-17", // 광복절 + 대체공휴일
  "2026-09-24", "2026-09-25", "2026-09-26", // 추석 연휴
  "2026-10-03", "2026-10-05", // 개천절 + 대체공휴일
  "2026-10-09", // 한글날
  "2026-12-25" // 크리스마스
]);

export const HOLIDAY_SURCHARGE_RATE = 0.2;

/** dateStr: "YYYY-MM-DD" (KST 기준 방문 희망일) */
export function isHolidayOrWeekend(dateStr: string): boolean {
  const trimmed = dateStr?.trim();
  if (!trimmed) return false;
  if (KR_HOLIDAYS_2026.has(trimmed)) return true;
  const parsed = new Date(`${trimmed}T12:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const day = parsed.getDay();
  return day === 0 || day === 6;
}

/** 기본 출장비에 휴일/공휴일 할증(20%)을 적용한 최종 금액(원 단위 반올림) */
export function applyHolidaySurcharge(baseFee: number, preferredDate: string): number {
  if (!Number.isFinite(baseFee) || baseFee <= 0) return baseFee;
  if (!isHolidayOrWeekend(preferredDate)) return baseFee;
  return Math.round(baseFee * (1 + HOLIDAY_SURCHARGE_RATE));
}
