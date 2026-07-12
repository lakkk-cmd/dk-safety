"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

type AppLane = "user" | "admin" | "worker" | "system";

type ProcessStep = {
  no: number;
  lane: AppLane;
  title: string;
  detail: string;
  /** 이 단계에서 바뀌는 데이터 상태(있을 때만) */
  stateChange?: string;
};

const LANE_LABEL: Record<AppLane, string> = {
  user: "👤 사용자 앱 (고객)",
  admin: "🛠 관리자 화면",
  worker: "🔧 기사 앱",
  system: "⚙️ 시스템 자동"
};

const LANE_CLASS: Record<AppLane, string> = {
  user: "border-dk-blue/40 bg-dk-blue/5",
  admin: "border-dk-navy/40 bg-dk-navy/5",
  worker: "border-orange-400/50 bg-orange-50",
  system: "border-emerald-400/50 bg-emerald-50"
};

const LANE_BADGE_CLASS: Record<AppLane, string> = {
  user: "bg-dk-blue text-white",
  admin: "bg-dk-navy text-white",
  worker: "bg-orange-500 text-white",
  system: "bg-emerald-600 text-white"
};

const STEPS: ProcessStep[] = [
  {
    no: 1,
    lane: "user",
    title: "접수 시작 — 기본 정보 입력",
    detail: "아파트 홈 화면에서 \"점검·수리\"를 누르고 동/호수/성명/연락처를 입력합니다.",
    stateChange: "reservations 없음 → 접수 준비"
  },
  {
    no: 2,
    lane: "user",
    title: "증상 작성 + 현장 사진 첨부",
    detail: "고장 증상(2자 이상)과 현장 사진을 1장 이상 첨부합니다.",
  },
  {
    no: 3,
    lane: "user",
    title: "방문 희망 일시 선택 → 접수 생성",
    detail: "날짜/시간을 고르면 접수(reservations)와 주문(orders)이 함께 생성됩니다.",
    stateChange: "payment_status = PENDING · dispatch_status = BLOCKED"
  },
  {
    no: 4,
    lane: "user",
    title: "예약금 결제",
    detail: "가상계좌가 자동 발급되어 입금하거나, 계좌이체 후 \"입금 완료\"를 누릅니다.",
    stateChange: "입금 확인 시 payment_status = PAID · dispatch_status = READY"
  },
  {
    no: 5,
    lane: "admin",
    title: "입금 확인",
    detail: "금융/가상계좌 관리 화면에서 실입금을 대사·확정합니다(가상계좌는 자동 확인).",
  },
  {
    no: 6,
    lane: "admin",
    title: "담당 기사 배정",
    detail: "실시간 배정 관제 화면에서 결제 완료 건에 현장 기사를 배정합니다.",
    stateChange: "dispatch_status = ASSIGNED"
  },
  {
    no: 7,
    lane: "worker",
    title: "배정 확인 → 현장 방문",
    detail: "기사 앱에서 배정된 작업을 확인하고 현장으로 이동합니다.",
  },
  {
    no: 8,
    lane: "worker",
    title: "작업 시작 · 현장 점검",
    detail: "작업을 \"진행중\"으로 전환하고 체크리스트 입력, 현장 사진을 촬영합니다.",
    stateChange: "task_status = in_progress"
  },
  {
    no: 9,
    lane: "worker",
    title: "AI 현장 소견 확인 · 리포트 저장",
    detail: "점검 결과를 바탕으로 AI가 자동 생성한 소견(관련 KEC 조항 포함)을 확인하고 현장점검 리포트를 저장합니다.",
  },
  {
    no: 10,
    lane: "worker",
    title: "작업 완료 처리",
    detail: "기사가 작업 완료를 누르면 접수 상태가 \"완료\"로 바뀝니다.",
    stateChange: "task_status = completed · reservations.status = 완료"
  },
  {
    no: 11,
    lane: "system",
    title: "고객에게 완료 알림 자동 발송",
    detail: "작업 완료 즉시 카카오 알림톡(실패 시 SMS)으로 고객에게 자동 통보됩니다.",
  },
  {
    no: 12,
    lane: "admin",
    title: "현장점검 리포트 발송",
    detail: "임대인용·거주자용 PDF 리포트 링크를 카카오 알림톡으로 발송합니다.",
  },
  {
    no: 13,
    lane: "admin",
    title: "현장 추가 비용 정산 승인",
    detail: "현장에서 추가 비용이 발생한 경우, 정산 승인 화면에서 최종 금액을 확정합니다.",
    stateChange: "final_payment_status = REQUESTED"
  },
  {
    no: 14,
    lane: "user",
    title: "최종 정산 결제",
    detail: "고객이 추가 비용을 카드로 결제합니다. (추가 비용이 없으면 이 단계는 생략됩니다.)",
    stateChange: "final_payment_status = PAID"
  },
  {
    no: 15,
    lane: "system",
    title: "디지털 보증서 자동 발급",
    detail: "최종 결제가 확인되는 즉시 보증서 번호가 생성되고 디지털 보증서가 자동 발급됩니다.",
    stateChange: "warranty_issued_at 기록"
  },
  {
    no: 16,
    lane: "user",
    title: "보증서 확인 · 다운로드",
    detail: "고객은 보증서 이미지·PDF를 다운로드하고, 공개 인증 링크(/verify/보증번호)로 진위를 확인할 수 있습니다.",
  },
  {
    no: 17,
    lane: "admin",
    title: "매출·처리 현황 집계",
    detail: "시스템 통계 화면에서 매출·처리 건수·보증서 발급 현황을 확인합니다.",
  }
];

export default function AdminProcessGuide() {
  return (
    <div className="mx-auto max-w-4xl">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
        }
      `}</style>

      <div className="print:hidden mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          아래 내용을 그대로 인쇄하거나, 인쇄 대화상자에서 &quot;PDF로 저장&quot;을 선택하면 문서 파일로 다운로드할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-dk-navy px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-dk-navy/90"
        >
          <Printer className="h-4 w-4" aria-hidden />
          인쇄 / PDF로 저장
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:break-inside-avoid print:border-slate-400 print:shadow-none">
        <h2 className="text-lg font-black text-slate-900">전체 흐름 한눈에 보기</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold">
          <span className="rounded-full bg-dk-blue/10 px-3 py-1 text-dk-blue">👤 사용자 접수·결제</span>
          <span aria-hidden className="text-slate-400">→</span>
          <span className="rounded-full bg-dk-navy/10 px-3 py-1 text-dk-navy">🛠 관리자 입금확인·배정</span>
          <span aria-hidden className="text-slate-400">→</span>
          <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700">🔧 기사 현장점검·완료</span>
          <span aria-hidden className="text-slate-400">→</span>
          <span className="rounded-full bg-dk-navy/10 px-3 py-1 text-dk-navy">🛠 관리자 정산승인</span>
          <span aria-hidden className="text-slate-400">→</span>
          <span className="rounded-full bg-dk-blue/10 px-3 py-1 text-dk-blue">👤 사용자 최종결제</span>
          <span aria-hidden className="text-slate-400">→</span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">⚙️ 보증서 자동발급</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
          {(Object.keys(LANE_LABEL) as AppLane[]).map((lane) => (
            <span key={lane} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", LANE_BADGE_CLASS[lane])} aria-hidden />
              {LANE_LABEL[lane]}
            </span>
          ))}
        </div>
      </section>

      <ol className="mt-6 space-y-3">
        {STEPS.map((step) => (
          <li
            key={step.no}
            className={cn(
              "flex gap-3 rounded-2xl border-2 p-4 shadow-sm print:break-inside-avoid print:shadow-none",
              LANE_CLASS[step.lane]
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black",
                LANE_BADGE_CLASS[step.lane]
              )}
            >
              {step.no}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">{LANE_LABEL[step.lane]}</span>
              </div>
              <h3 className="mt-0.5 text-base font-extrabold text-slate-900">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{step.detail}</p>
              {step.stateChange ? (
                <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-slate-500">
                  상태 변화: {step.stateChange}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-center text-xs text-slate-400 print:mt-6">
        우리집 전기주치의(대경이엔피) · 내부 운영 문서 — 접수부터 디지털 보증서 발급까지 전체 업무 흐름
      </p>
    </div>
  );
}
