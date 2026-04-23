"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function GlobalResidentLogoutButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname === "/resident/login") {
      setVisible(false);
      return;
    }

    (async () => {
      try {
        const response = await fetch("/api/resident/me", { cache: "no-store" });
        setVisible(response.ok);
      } catch {
        setVisible(false);
      }
    })();
  }, [pathname]);

  if (!visible) return null;

  const onLogout = async () => {
    setLoading(true);
    try {
      await fetch("/api/resident/logout", { method: "POST" });
      router.replace("/resident/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onLogout()}
      disabled={loading}
      className="fixed right-4 top-4 z-50 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.16)] backdrop-blur hover:bg-white disabled:opacity-60"
    >
      {loading ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}
