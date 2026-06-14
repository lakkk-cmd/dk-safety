import type { ReactNode } from "react";
import AdminLogoutButton from "@/components/admin-logout-button";
import BrandLockup from "@/components/brand-lockup";

export default function ContentsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-cc-bg text-cc-text">
      <header className="bg-cc-navy text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 md:px-6">
          <BrandLockup />
          <AdminLogoutButton variant="dark" />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">{children}</div>
    </div>
  );
}
