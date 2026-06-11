import type { ReactNode } from "react";
import AdminLogoutButton from "@/components/admin-logout-button";

export default function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 md:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">AGENT PIPELINE</p>
            <h1 className="mt-1 text-lg font-black text-slate-900">AI 파이프라인 모니터</h1>
          </div>
          <AdminLogoutButton />
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">{children}</div>
    </div>
  );
}
