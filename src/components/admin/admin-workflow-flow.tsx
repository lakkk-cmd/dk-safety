import Link from "next/link";
import { Fragment } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { adminWorkflowSteps } from "@/lib/admin-nav";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export default function AdminWorkflowFlow({ className }: Props) {
  const steps = adminWorkflowSteps;

  return (
    <section
      className={cn(
        "rounded-[1.75rem] border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:to-slate-950 md:p-8",
        className
      )}
    >
      <div className="mb-6 border-b border-slate-200 pb-4 dark:border-slate-700">
        <h2 className="text-xl font-black text-slate-900 dark:text-slate-50">업무 진행 흐름</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          왼쪽에서 오른쪽으로(모바일은 위에서 아래로) 단계가 이어집니다. 건너뛰지 않고 순서를 지키면 누락 없이 운영할 수 있습니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">기반·단지</span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">예약</span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">입금</span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">기사</span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">배정·현장</span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">보증</span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">통계</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:flex-nowrap md:items-stretch md:gap-0 md:overflow-x-auto md:pb-2 md:[scrollbar-gutter:stable]">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <Fragment key={step.href}>
              <Link
                href={step.href}
                className={cn(
                  "group relative flex min-w-0 flex-1 flex-col rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm transition",
                  "hover:border-[#0b1c3a]/40 hover:shadow-md md:min-w-[158px]",
                  "dark:border-slate-600 dark:bg-slate-950 dark:hover:border-sky-500/40"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#0b1c3a] text-xs font-black text-white dark:bg-slate-700">
                    {step.step}
                  </span>
                  <Icon className="h-5 w-5 shrink-0 text-[#1a4b8c] opacity-90 dark:text-sky-400" aria-hidden />
                </div>
                <span className="mt-3 break-keep text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">{step.label}</span>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{step.flowRole}</p>
                <span className="mt-3 text-xs font-semibold text-[#0a5eb0] group-hover:underline dark:text-sky-400">화면 열기</span>
              </Link>

              {index < steps.length - 1 ? (
                <div
                  className="flex shrink-0 items-center justify-center py-2 text-slate-400 md:w-7 md:py-0 md:text-slate-400"
                  aria-hidden
                >
                  <ChevronDown className="h-6 w-6 md:hidden" />
                  <ChevronRight className="hidden h-7 w-7 md:block" />
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
