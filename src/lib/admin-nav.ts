import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Building2,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  CreditCard,
  FileBadge,
  FileText,
  LayoutDashboard,
  Lightbulb,
  ListOrdered,
  MessageSquare,
  PieChart,
  ShieldUser,
  Table2,
  UserCog,
  Users,
  Wallet,
  Wrench
} from "lucide-react";

export const ADMIN_HOME_HREF = "/admin/home";
export const ADMIN_WORKFLOW_HREF = "/admin/workflow";

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

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** 이 항목 앞에 렌더링할 섹션 구분자 레이블 */
  sectionLabel?: string;
};

/** 왼쪽 사이드바 및 메인 대시보드 카드와 동일한 순서 */
export const adminSidebarNavItems: AdminNavItem[] = [
  {
    href: ADMIN_HOME_HREF,
    label: "메인화면",
    description: "관리 업무 요약·바로가기",
    icon: LayoutDashboard
  },
  {
    href: ADMIN_WORKFLOW_HREF,
    label: "업무 진행 흐름",
    description: "단계별 운영 순서·화면 이동",
    icon: ListOrdered
  },
  {
    href: "/admin/customers",
    label: "고객관리",
    description: "접수·예약·주문·배정·보증 통합 조회",
    icon: Users
  },
  {
    href: "/admin/apartments",
    label: "아파트 단지 관리",
    description: "단지 코드, 명칭, 계좌·기본료",
    icon: Building2
  },
  {
    href: "/admin/pricing",
    label: "요금/단가표",
    description: "기본 출장비·항목별 금액·안내 문구",
    icon: Table2
  },
  {
    href: "/admin/finance",
    label: "금융/가상계좌 관리",
    description: "입금·가상계좌 모니터링",
    icon: CreditCard
  },
  {
    href: "/admin/dispatch",
    label: "실시간 배정 관제",
    description: "결제 완료 주문 기사 배정",
    icon: ClipboardCheck
  },
  {
    href: "/admin/billing",
    label: "현장 정산 승인",
    description: "현장 추가 요금·정산",
    icon: ChartColumn
  },
  {
    href: "/admin/warranties",
    label: "디지털 보증서 관리",
    description: "보증서 발급·검증",
    icon: FileBadge
  },
  {
    href: "/admin/technicians",
    label: "기사/인증 관리",
    description: "현장 기사·연락처·PIN",
    icon: UserCog
  },
  {
    href: "/admin/electrical-tips",
    label: "생활전기정보",
    description: "안전·절약·자가점검 콘텐츠 관리",
    icon: Lightbulb
  },
  {
    href: "/admin/knowledge",
    label: "지식베이스 관리",
    description: "PDF 자동분류·학습 — RAG 지식베이스",
    icon: BookOpen
  },
  {
    href: "/admin/documents",
    label: "생성된 문서 관리",
    description: "AI 채팅이 작성한 점검보고서·견적서 등 PDF/Word",
    icon: FileText
  },
  {
    href: "/admin/walk-in",
    label: "현장 즉시접수",
    description: "예약 없는 현장 작업 즉시 등록·완료 처리",
    icon: Wrench
  },
  {
    href: "/admin/stats",
    label: "시스템 통계",
    description: "집계·현황·로그",
    icon: ShieldUser
  },
  // ── CRM ──────────────────────────────────────────────────────────────────
  {
    href: "/admin/crm/customers",
    label: "고객관리 (CRM)",
    description: "예약 이력 기반 고객 목록·재상담 일정",
    icon: Users,
    sectionLabel: "CRM"
  },
  {
    href: "/admin/crm/consultations",
    label: "상담관리",
    description: "전화·카카오·방문 상담 기록 입력·조회",
    icon: MessageSquare
  },
  {
    href: "/admin/crm/follow-up",
    label: "재상담알림",
    description: "이번 주 재상담 예정·문자 발송",
    icon: CalendarDays
  },
  // ── ERP ──────────────────────────────────────────────────────────────────
  {
    href: "/admin/erp/workers",
    label: "작업자관리",
    description: "직원·외주 인력 단가·전문분야",
    icon: UserCog,
    sectionLabel: "ERP"
  },
  {
    href: "/admin/erp/expenses",
    label: "경비관리",
    description: "재료비·교통비 등 경비 입력·월별 집계",
    icon: Wallet
  },
  {
    href: "/admin/erp/invoices",
    label: "견적/영수증",
    description: "세금계산서·영수증·견적서 발행",
    icon: FileText
  },
  {
    href: "/admin/erp/dashboard",
    label: "경영대시보드",
    description: "매출·지출·수익 6개월 추세·미수금",
    icon: PieChart
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
    label: "금융/가상계좌 관리",
    flowRole: "가상계좌·실입금을 확인해 결제를 확정합니다.",
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
