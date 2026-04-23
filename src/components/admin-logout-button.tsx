"use client";

import { useRouter } from "next/navigation";

export default function AdminLogoutButton() {
  const router = useRouter();

  const onLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <button onClick={onLogout} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
      로그아웃
    </button>
  );
}
