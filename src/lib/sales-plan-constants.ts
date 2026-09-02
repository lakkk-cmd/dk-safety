/** hq 9-11월 영업계획 현황판(.omc/plans/hq-sales-plan-dashboard-2026-09.md) 공용 상수.
 * 읽기(hq-summary.ts 집계)와 쓰기(sales-visit-log 페이지의 영업비 미니폼)가 모두 이 파일을
 * import해서 태그/기간/필터 정의가 한 곳에서만 바뀌도록 한다. */

/** expenses.description에 붙이는 태그 — 카테고리는 자연값(교통비/광고비/기타)을 그대로 두고
 * 이 태그만으로 budgetUsed를 집계한다(카테고리 마이그레이션 없이, ERP 통계 오염 없이).
 * 쓰기 측(sales-visit-log 페이지)이 이 태그를 사용자 입력 앞에 코드로 자동 부착하므로
 * 대표님이 직접 타이핑하지 않는다. */
export const SALES_PLAN_EXPENSE_TAG = "[영업계획] ";

/** "신규 B2C 예약" 카운트에 포함할 접수 경로. 기본값은 전체 포함 — reservations-store.ts의
 * source는 옵셔널 필드라 값이 없는(레거시) 행도 이 기본값에서는 포함된다. 1주차 카카오 알림을
 * 보고 대표님이 체감 숫자와 다르면 이 배열만 좁혀서 조정한다. */
export const SALES_PLAN_RESERVATION_SOURCES: ReadonlyArray<"online" | "walk_in" | "phone"> = [
  "online",
  "walk_in",
  "phone",
];

/** 9-11월 영업 캠페인 기간(KST 날짜 기준, getKstDateTime().dateKey와 문자열 비교 가능). */
export const SALES_PLAN_WINDOW = {
  start: "2026-09-01",
  end: "2026-11-30",
} as const;

export const SALES_PLAN_MONTH_TARGET = 10;
export const SALES_PLAN_CAMPAIGN_TARGET = 30;
export const SALES_PLAN_BUDGET_CAP = 500000;
