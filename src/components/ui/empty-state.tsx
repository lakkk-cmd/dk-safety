import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon = "📭", title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center", className)}>
      <span className="text-4xl leading-none">{icon}</span>
      <p className="mt-1 text-lg font-bold text-dk-navy">{title}</p>
      {description ? <p className="text-[15px] leading-relaxed text-slate-500">{description}</p> : null}
      {action ? <div className="mt-3 w-full">{action}</div> : null}
    </div>
  );
}
