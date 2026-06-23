import { cn } from "@/lib/utils";

export interface StepProgressProps {
  steps: string[];
  current: number;
  className?: string;
  sticky?: boolean;
}

export function StepProgress({ steps, current, className, sticky = true }: StepProgressProps) {
  const total = steps.length;
  const percent = total <= 1 ? 100 : Math.round((current / (total - 1)) * 100);

  return (
    <div className={cn(sticky && "sticky top-0 z-30", "bg-white/95 backdrop-blur", className)}>
      <div className="h-1.5 w-full overflow-hidden bg-dk-sky">
        <div className="h-full bg-dk-blue transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex items-center justify-between gap-1 px-4 py-2">
        {steps.map((label, idx) => {
          const isDone = idx < current;
          const isCurrent = idx === current;
          return (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                  isDone && "bg-dk-blue text-white",
                  isCurrent && "bg-dk-navy text-white",
                  !isDone && !isCurrent && "bg-dk-gray text-slate-400"
                )}
              >
                {isDone ? "✓" : idx + 1}
              </span>
              <span
                className={cn(
                  "text-[13px] font-semibold",
                  isCurrent ? "text-dk-navy" : "text-slate-400"
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
