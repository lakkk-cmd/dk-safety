import type { ReactNode } from "react";
import AdminLogoutButton from "@/components/admin-logout-button";

export default function ContentsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 md:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">CONTENT COMMAND CENTER</p>
            <h1 className="mt-1 text-lg font-black text-slate-900">콘텐츠 마케팅 사령부</h1>
          </div>
          <AdminLogoutButton />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">{children}</div>
    </div>
  );
}
