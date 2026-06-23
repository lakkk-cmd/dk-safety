import type { ReactNode } from "react";
import AdminLogoutButton from "@/components/admin-logout-button";

type Props = {
  title: string;
  description?: string;
  badge?: string;
  actions?: ReactNode;
  showLogout?: boolean;
};

/** admin 24개 화면 공용 상단 밴드 — `.warranty-band`/`.warranty-badge` 토큰 기반 (reservations 페이지와 동일 패턴) */
export default function AdminPageHeader({ title, description, badge = "관리자 콘솔", actions, showLogout = true }: Props) {
  return (
    <header className="warranty-band mb-6 rounded-[2rem] p-6 md:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="warranty-badge">{badge}</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-700">{description}</p> : null}
          {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {showLogout ? <AdminLogoutButton /> : null}
      </div>
    </header>
  );
}
