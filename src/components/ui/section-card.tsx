import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
}

export function SectionCard({ icon, title, action, className, children, ...props }: SectionCardProps) {
  return (
    <div className={cn("rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(11,31,58,0.08)]", className)} {...props}>
      {title || icon || action ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {icon ? <span className="text-xl leading-none">{icon}</span> : null}
            {title ? <h2 className="text-lg font-bold tracking-[-0.01em] text-dk-navy">{title}</h2> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
