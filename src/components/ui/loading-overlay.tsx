import { cn } from "@/lib/utils";

export interface LoadingOverlayStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
}

export interface LoadingOverlayProps {
  steps: LoadingOverlayStep[];
  title?: string;
  className?: string;
}

function StepIcon({ status }: { status: LoadingOverlayStep["status"] }) {
  if (status === "done") return <span className="text-xl text-dk-green">✅</span>;
  if (status === "error") return <span className="text-xl text-dk-red">❌</span>;
  if (status === "running") {
    return (
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-[3px] border-dk-sky border-t-dk-blue" />
    );
  }
  return <span className="inline-block h-5 w-5 rounded-full border-2 border-slate-300" />;
}

export function LoadingOverlay({ steps, title = "처리 중입니다", className }: LoadingOverlayProps) {
  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-dk-navy/60 backdrop-blur-sm", className)}>
      <div className="mx-4 w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_20px_60px_rgba(11,31,58,0.35)]">
        <p className="text-center text-lg font-bold text-dk-navy">{title}</p>
        <ul className="mt-5 space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-3">
              <StepIcon status={step.status} />
              <span
                className={cn(
                  "text-[15px] font-semibold",
                  step.status === "pending" ? "text-slate-400" : "text-dk-navy"
                )}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
