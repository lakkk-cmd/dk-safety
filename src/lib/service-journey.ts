/**
 * 우리집 전기주치의(대경이엔피) 서비스 여정·파이프라인 단일 정의
 *
 * 참고: 플러스엑스 브런치 「UX·UI 분석하고 개선하기」 시리즈에서 다루는
 * 서비스 UX 분석 흐름(사용자 맥락 파악 → 문제·마찰 정의 → 개선 축 설계)과 동일한 축을
 * 제품 도메인에 대응시킨 것입니다. (예: #05 배달의민족 편 — 이용 맥락·정보 구조·행동 유도 분석)
 *
 * 이 모듈은 UI 카피와 라우트 가드가 서로 어긋나지 않도록 라우트 그룹·단계 키를 한곳에서 노출합니다.
 */

/** 입주민·방문자 관점: 분석 프레임과 대응되는 단계 */
export const RESIDENT_JOURNEY_AXES = [
  {
    id: "orient",
    title: "맥락·진입",
    summary: "단지 식별, 브랜드 신뢰, 서비스 발견",
    routeNotes: "/, /home, /apt/{code}, 단지 랜딩"
  },
  {
    id: "assess",
    title: "위험·상태 평가",
    summary: "전기 안전 자가진단으로 사전 위험도 인지",
    routeNotes: "/resident/safety-check…"
  },
  {
    id: "act",
    title: "서비스 요청",
    summary: "점검·수리, 긴급출동, 상담 등 의도에 맞는 접수",
    routeNotes: "/apt/{code}/repair|emergency, 예약 플로우"
  },
  {
    id: "commit",
    title: "예약 확정·결제",
    summary: "예약금·게이트웨이로 접수 확정",
    routeNotes: "주문·결제 API, /payment/success|fail"
  },
  {
    id: "fulfill",
    title: "현장 이행",
    summary: "배정·방문·작업·현장 정산",
    routeNotes: "worker 앱, 관리자 배정·정산"
  },
  {
    id: "verify",
    title: "보증·검증",
    summary: "디지털 보증서·QR 검증",
    routeNotes: "/verify/{warranty_number}"
  }
] as const;

/** 예약·주문 화면 공통 4단계 (FourStepFlow와 동기화) */
export type OrderFulfillmentStepKey = "problem" | "payment" | "waiting" | "warranty";

export const ORDER_FULFILLMENT_STEPS: Array<{ key: OrderFulfillmentStepKey; label: string }> = [
  { key: "problem", label: "1. 문제 선택" },
  { key: "payment", label: "2. 예약금 결제" },
  { key: "waiting", label: "3. 기사 방문 대기" },
  { key: "warranty", label: "4. 정산/보증서" }
];

/**
 * /resident/* 세션 쿠키 없이 접근 가능한 경로 (middleware와 동일 조건)
 */
export function residentSessionNotRequired(pathname: string): boolean {
  if (pathname === "/" || pathname === "/home") return true;

  if (/^\/[^/]+\/home$/.test(pathname)) return true;
  if (/^\/apt\/[^/]+$/.test(pathname)) return true;
  if (pathname.startsWith("/apt/")) return true;

  const firstSegment = pathname.slice(1).split("/")[0] ?? "";
  if (/^\/[^/]+$/.test(pathname) && !["home", "admin", "resident", "worker", "apt"].includes(firstSegment)) {
    return true;
  }

  if (
    pathname === "/resident/safety-check" ||
    pathname === "/resident/safety-check/result" ||
    pathname === "/resident/safety-check/questions"
  ) {
    return true;
  }

  if (pathname === "/resident/history" || pathname === "/reservation" || pathname === "/emergency") {
    return true;
  }

  if (pathname === "/blog" || pathname.startsWith("/blog/")) return true;

  if (/^\/verify\/[^/]+$/.test(pathname)) return true;
  if (/^\/diagnosis\/[^/]+$/.test(pathname)) return true;

  if (pathname === "/payment/success" || pathname === "/payment/fail") return true;

  if (pathname === "/resident/login") return true;
  if (/^\/apt\/[^/]+\/resident\/login$/.test(pathname)) return true;

  return false;
}
