import * as React from "react";
import { cn } from "@/lib/utils";

export function Sidebar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <aside
      className={cn(
        "flex h-full w-full max-w-[280px] flex-col border-r border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-950",
        className
      )}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-slate-200 p-4 dark:border-slate-800", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 overflow-y-auto p-3", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("space-y-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("list-none", className)} {...props} />;
}

export function SidebarMenuButton({ className, isActive, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean }) {
  return (
    <button
      data-active={isActive ? "true" : "false"}
      className={cn(
        "dk-admin-shell-nav-btn flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold transition",
        isActive
          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
          : "text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-slate-800",
        className
      )}
      {...props}
      type="button"
    />
  );
}

export function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("dk-admin-main min-w-0 flex-1 bg-white dark:bg-slate-900", className)} {...props} />
  );
}
