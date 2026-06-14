"use client";

import { useRouter } from "next/navigation";

export default function AdminLogoutButton({ variant = "light" }: { variant?: "light" | "dark" }) {
  const router = useRouter();

  const onLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  };

  const className =
    variant === "dark"
      ? "rounded-lg border border-white/30 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10"
      : "rounded-lg border border-slate-300 px-4 py-2 text-sm";

  return (
    <button onClick={onLogout} className={className}>
      로그아웃
    </button>
  );
}
