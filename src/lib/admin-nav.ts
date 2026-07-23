import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BookOpen,
  BookOpenCheck,
  Bot,
  Building2,
  CalendarDays,
  ChartColumn,
  CircleDollarSign,
  ClipboardCheck,
  Cog,
  CreditCard,
  FileBadge,
  FileText,
  HandCoins,
  LayoutDashboard,
  Lightbulb,
  ListOrdered,
  MessageSquare,
  PieChart,
  PiggyBank,
  Printer,
  Scale,
  ShieldAlert,
  ShieldUser,
  Table2,
  TrendingUp,
  Truck,
  UserCircle,
  UserCog,
  Users,
  Wallet,
  Wrench
} from "lucide-react";

export const ADMIN_HOME_HREF = "/admin/home";
export const ADMIN_WORKFLOW_HREF = "/admin/workflow";
export const ADMIN_PROCESS_GUIDE_HREF = "/admin/process-guide";

/** 메인화면 빠른 이동 카드 하단 검색 → `/api/admin/quick-search` */
export type AdminQuickSearchScope =
  | "apartments"
  | "pricing"
  | "finance"
  | "dispatch"
  | "billing"
  | "warranties"
  | "technicians"
  | "customers"
  | "electrical-tips";

const QUICK_SEARCH_BY_HREF: Partial<Record<string, AdminQuickSearchScope>> = {
  "/admin/apartments": "apartments",
  "/admin/pricing": "pricing",
  "/admin/finance": "finance",
  "/admin/dispatch": "dispatch",
  "/admin/billing": "billing",
  "/admin/warranties": "warranties",
  "/admin/technicians": "technicians",
  "/admin/customers": "customers",
  "/admin/electrical-tips": "electrical-tips"
};

export function adminQuickSearchScopeForHref(href: string): AdminQuickSearchScope | null {
  return QUICK_SEARCH_BY_HREF[href] ?? null;
}

/**
 * 메인화면 모듈 그리드용 분류 — Amaranth10/iCUBE 구조분석(2026-07-19)을 근거로 한
 * 4그룹 재편성. 사이드바(admin/layout.tsx)는 이 필드를 쓰지 않고 기존 순서 그대로 렌더링한다.
 * - core: 접수·배정·정산·회계 등 매일 쓰는 운영 코어
 * - ext:  단가/재료비/안전모니터링 등 dk-safety 자체 확장 모듈 (Douzone에 없는 것)
 * - link: 시스템 설정/통계 — 계정·백업류
 * - ai:   AI 허브 (adminExternalHubLinks에서 별도 관리)
 */
export type AdminModuleGroup = "core" | "ext" | "link" | "ai";

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** 이 항목 앞에 렌더링할 섹션 구분자 레이블 */
  sectionLabel?: string;
  moduleGroup: AdminModuleGroup;
};

/**
 * 왼쪽 사이드바 및 메인 대시보드 카드와 동일한 순서.
 * 2026-07-19: "일반" 메뉴로 나열되던 항목들을 CRM/ERP/설정 3개 섹션으로 재분류함
 * (대표님 확인 후 진행) — 메인화면/업무흐름 계열만 내비게이션 성격이라 미분류로 남김.
 */
export const adminSidebarNavItems: AdminNavItem[] = [
  {
    href: ADMIN_HOME_HREF,
    label: "메인화면",
    description: "관리 업무 요약·바로가기",
    icon: LayoutDashboard,
    moduleGroup: "core"
  },
  {
    href: ADMIN_WORKFLOW_HREF,
    label: "업무 진행 흐름",
    description: "단계별 운영 순서·화면 이동",
    icon: ListOrdered,
    moduleGroup: "core"
  },
  {
    href: ADMIN_PROCESS_GUIDE_HREF,
    label: "업무 흐름 안내서 (인쇄용)",
    description: "사용자·관리자·기사앱 전체 흐름 — 인쇄/PDF 다운로드",
    icon: Printer,
    moduleGroup: "core"
  },
  // ── CRM (고객에게 노출되거나 고객 1:1 관계와 직결된 것) ──────────────────────
  // 고객관리(CRM)는 2026-07-19에 고객관리(/admin/customers "고객별 보기" 탭)로 통합됨 —
  // 같은 reservations 데이터를 예약 단위/전화번호 단위로 나눠 보여주던 화면 2개였음.
  {
    href: "/admin/customers",
    label: "고객관리",
    description: "예약별 보기(접수·주문·배정·보증) / 고객별 보기(재상담·잠재고객) 탭 통합",
    icon: Users,
    sectionLabel: "CRM",
    moduleGroup: "core"
  },
  {
    href: "/admin/apartments",
    label: "아파트 단지 관리",
    description: "단지 코드, 명칭, 계좌·기본료",
    icon: Building2,
    moduleGroup: "ext"
  },
  {
    href: "/admin/crm/consultations",
    label: "상담관리",
    description: "전화·카카오·방문 상담 기록 입력·조회",
    icon: MessageSquare,
    moduleGroup: "core"
  },
  {
    href: "/admin/crm/follow-up",
    label: "재상담알림",
    description: "이번 주 재상담 예정·문자 발송",
    icon: CalendarDays,
    moduleGroup: "core"
  },
  {
    href: "/admin/resident-safety",
    label: "입주민 통합 모니터링",
    description: "단지별 위험도 집계·고위험 입주민 확인",
    icon: ShieldAlert,
    moduleGroup: "ext"
  },
  {
    href: "/admin/electrical-tips",
    label: "생활전기정보",
    description: "안전·절약·자가점검 콘텐츠 관리",
    icon: Lightbulb,
    moduleGroup: "ext"
  },
  {
    href: "/admin/warranties",
    label: "디지털 보증서 관리",
    description: "보증서 발급·검증",
    icon: FileBadge,
    moduleGroup: "core"
  },
  // ── ERP (돈·자원·인력 운영과 직결된 것) ────────────────────────────────────
  // 작업자관리(단가·전문분야)는 2026-07-19에 기사/인증 관리(/admin/technicians)로 통합됨 —
  // 같은 workers 테이블을 두 화면에서 따로 관리하다 PIN 미발급 상태로 등록되는 문제가 있었음.
  {
    href: "/admin/finance",
    label: "금융/계좌 관리",
    description: "입금·계좌 모니터링",
    icon: CreditCard,
    sectionLabel: "ERP",
    moduleGroup: "core"
  },
  {
    href: "/admin/dispatch",
    label: "실시간 배정 관제",
    description: "결제 완료 주문 기사 배정",
    icon: ClipboardCheck,
    moduleGroup: "core"
  },
  {
    href: "/admin/billing",
    label: "현장 정산 승인",
    description: "현장 추가 요금·정산",
    icon: ChartColumn,
    moduleGroup: "core"
  },
  {
    href: "/admin/technicians",
    label: "기사/인증 관리",
    description: "현장 기사·연락처·PIN, 단가·전문분야·자격증까지 통합 관리",
    icon: UserCog,
    moduleGroup: "core"
  },
  {
    href: "/admin/walk-in",
    label: "현장 즉시접수",
    description: "예약 없는 현장 작업 즉시 등록·완료 처리",
    icon: Wrench,
    moduleGroup: "core"
  },
  // 재료비 카탈로그·작업비 난이도 정액표는 2026-07-19에 요금/단가표(/admin/pricing) 탭으로 통합됨 —
  // 서로 다른 테이블(payment_settings/material_catalog/labor_tier_catalog)이지만 전부 가격 정책이라
  // 화면 3개로 나뉘어 있던 것을 하나로 합침.
  {
    href: "/admin/pricing",
    label: "요금/단가표",
    description: "출장비·서비스요금 / 재료비 카탈로그 / 작업비 난이도 정액표 탭 통합",
    icon: Table2,
    moduleGroup: "ext"
  },
  {
    href: "/admin/erp/expenses",
    label: "경비관리",
    description: "재료비·교통비 등 경비 입력·월별 집계",
    icon: Wallet,
    moduleGroup: "core"
  },
  {
    href: "/admin/erp/settlement",
    label: "기사 수당 정산",
    description: "완료 작업 지급액 확정 — 경비관리(인건비)에 자동 반영",
    icon: HandCoins,
    moduleGroup: "core"
  },
  {
    href: "/admin/erp/invoices",
    label: "견적/영수증",
    description: "세금계산서·영수증·견적서 발행",
    icon: FileText,
    moduleGroup: "core"
  },
  {
    href: "/admin/erp/dashboard",
    label: "경영대시보드",
    description: "매출·지출·수익 6개월 추세·미수금",
    icon: PieChart,
    moduleGroup: "core"
  },
  {
    href: "/admin/erp/ledger",
    label: "총계정원장",
    description: "예약금·정산·경비·환불이 자동 기장되는 원장, 수기 전표 입력",
    icon: BookOpenCheck,
    moduleGroup: "core"
  },
  {
    href: "/admin/erp/income-statement",
    label: "손익계산서",
    description: "매출액-매출원가-판매관리비 = 영업이익 (기간별)",
    icon: Scale,
    moduleGroup: "core"
  },
  {
    href: "/admin/erp/receivables",
    label: "미수금 관리",
    description: "현장 정산 요청 후 입금 미확인 건, 경과일수",
    icon: CircleDollarSign,
    moduleGroup: "core"
  },
  {
    href: "/admin/erp/vendors",
    label: "매입/거래처 관리",
    description: "자재상·장비업체 거래처 등록, 거래처별 누적 매입액",
    icon: Truck,
    moduleGroup: "core"
  },
  {
    href: "/admin/erp/budget",
    label: "예산관리",
    description: "카테고리별 월 예산 대비 실제 지출 진행률",
    icon: PiggyBank,
    moduleGroup: "core"
  },
  // ── 설정 (고객도 돈도 아닌 시스템/콘텐츠 관리) ────────────────────────────
  {
    href: "/admin/knowledge",
    label: "지식베이스 관리",
    description: "PDF 자동분류·학습 — RAG 지식베이스",
    icon: BookOpen,
    sectionLabel: "설정",
    moduleGroup: "ext"
  },
  {
    href: "/admin/documents",
    label: "생성된 문서 관리",
    description: "AI 채팅이 작성한 점검보고서·견적서 등 PDF/Word",
    icon: FileText,
    moduleGroup: "ext"
  },
  {
    href: "/admin/stats",
    label: "시스템 통계",
    description: "집계·현황·로그",
    icon: ShieldUser,
    moduleGroup: "link"
  },
  {
    href: "/admin/account",
    label: "관리자 계정 관리",
    description: "관리자 계정 등록·이름/연락처/비밀번호 관리",
    icon: UserCircle,
    moduleGroup: "link"
  }
];

/**
 * 메인화면 모듈 그리드 전용 — 다른 서브도메인(hq/report/agent/contents)으로 나가는 카드.
 * 별도 로그인/레이아웃을 가진 섹션이라 왼쪽 사이드바에는 넣지 않는다.
 */
export type AdminHubLink = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  moduleGroup: Extract<AdminModuleGroup, "link" | "ai">;
};

export const adminExternalHubLinks: AdminHubLink[] = [
  {
    href: "/contents",
    label: "콘텐츠 발행 연동",
    description: "YouTube/카카오/블로그 승인·발행 현황",
    icon: TrendingUp,
    moduleGroup: "link"
  },
  {
    href: "/hq",
    label: "9-에이전트 채팅",
    description: "경영진 6인 + 콘텐츠 3인 AI 비서",
    icon: Bot,
    moduleGroup: "ai"
  },
  {
    href: "/hq/intelligence",
    label: "마켓 인텔리전스",
    description: "트렌드 키워드·경쟁채널 분석 대시보드",
    icon: ChartColumn,
    moduleGroup: "ai"
  },
  {
    href: "/report",
    label: "보고서 아카이브",
    description: "주간 경영보고서·로드맵 시각화",
    icon: Archive,
    moduleGroup: "ai"
  },
  {
    href: "/agent",
    label: "파이프라인 모니터",
    description: "YouTube/Gemini 자동화 실행 현황",
    icon: Cog,
    moduleGroup: "ai"
  }
];

/** 메인화면「업무 진행 흐름」용 — 실제 운영 순서(단지 → 예약 → 입금 → …) */
export type AdminWorkflowStep = {
  step: number;
  href: string;
  label: string;
  /** 이 단계가 전체 파이프라인에서 맡는 역할 (한 줄) */
  flowRole: string;
  icon: LucideIcon;
};

export const adminWorkflowSteps: AdminWorkflowStep[] = [
  {
    step: 1,
    href: "/admin/apartments",
    label: "아파트 단지 관리",
    flowRole: "서비스 단지·기본 요금·입금 계좌 등 기준 정보를 맞춥니다.",
    icon: Building2
  },
  {
    step: 2,
    href: "/admin/customers",
    label: "고객관리",
    flowRole: "접수 시 등록한 고객·예약·연결 주문·배정·보증 흐름을 한 화면에서 추적합니다.",
    icon: Users
  },
  {
    step: 3,
    href: "/admin/reservations",
    label: "예약/정산",
    flowRole: "고객 접수·일정·입금 상태를 한곳에서 관리합니다.",
    icon: CalendarDays
  },
  {
    step: 4,
    href: "/admin/finance",
    label: "금융/계좌 관리",
    flowRole: "계좌 입금을 확인해 결제를 확정합니다.",
    icon: CreditCard
  },
  {
    step: 5,
    href: "/admin/technicians",
    label: "기사/인증 관리",
    flowRole: "현장에 투입할 기사·연락처·인증을 준비합니다.",
    icon: UserCog
  },
  {
    step: 6,
    href: "/admin/dispatch",
    label: "실시간 배정 관제",
    flowRole: "입금 완료 건에 기사를 배정합니다.",
    icon: ClipboardCheck
  },
  {
    step: 7,
    href: "/admin/billing",
    label: "현장 정산 승인",
    flowRole: "현장 추가 요금·정산을 검토·승인합니다.",
    icon: ChartColumn
  },
  {
    step: 8,
    href: "/admin/warranties",
    label: "디지털 보증서 관리",
    flowRole: "작업 완료 후 보증서 발급·검증을 마무리합니다.",
    icon: FileBadge
  },
  {
    step: 9,
    href: "/admin/stats",
    label: "시스템 통계",
    flowRole: "매출·처리 건수·로그로 전체 운영을 점검합니다.",
    icon: ShieldUser
  }
];

/** 메인화면 빠른 이동 그리드용 (메인·흐름 페이지 자기참조 제외) */
export function adminQuickNavCards(excludeHref?: string): AdminNavItem[] {
  return adminSidebarNavItems.filter((item) => item.href !== excludeHref);
}

export function adminHubCards(): AdminNavItem[] {
  return adminQuickNavCards(ADMIN_HOME_HREF);
}
