"use client";

import { useEffect, useState } from "react";

type Me = {
  name: string;
  apartmentName: string;
  unitNumber: string;
};

export default function ResidentWelcomeBanner() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/resident/me", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { user: Me };
      setMe(data.user);
    })();
  }, []);

  if (!me) return null;

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 p-4 text-white shadow-[0_14px_28px_rgba(16,185,129,0.35)]">
      <p className="text-sm font-semibold">{me.name} 님, 환영합니다.</p>
      <p className="mt-1 text-sm text-emerald-50">
        {me.apartmentName} {me.unitNumber} 기준으로 안전 진단과 점검 예약을 쉽게 진행할 수 있습니다.
      </p>
    </div>
  );
}
