"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Me = {
  name: string;
  apartmentName: string;
  unitNumber: string;
};

export default function ResidentSessionBar() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/resident/me", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { user: Me };
      setMe(data.user);
    })();
  }, []);

  const logout = async () => {
    await fetch("/api/resident/logout", { method: "POST" });
    router.replace("/resident/login");
    router.refresh();
  };

  if (!me) {
    return null;
  }

  return (
    <div className="surface-card-strong mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <p className="text-sm text-slate-700">
        <span className="font-semibold">{me.name}</span> 님 ({me.apartmentName} {me.unitNumber})
      </p>
      <div className="flex gap-2">
        <Link href="/resident/safety-check" className="btn-outline px-3 py-1 text-sm">
          자가진단
        </Link>
        <Link href="/resident/history" className="btn-outline px-3 py-1 text-sm">
          진단이력
        </Link>
        <button onClick={() => void logout()} className="btn-outline px-3 py-1 text-sm">
          로그아웃
        </button>
      </div>
    </div>
  );
}
