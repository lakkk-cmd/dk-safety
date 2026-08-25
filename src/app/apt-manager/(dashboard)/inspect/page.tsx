"use client";

import { useEffect, useState } from "react";
import UnitInspectionForm from "@/components/worker/unit-inspection-form";
import { EmptyState } from "@/components/ui/empty-state";

export default function AptManagerInspectPage() {
  const [apartment, setApartment] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/apt-manager/me", { cache: "no-store" });
        const data = (await response.json()) as { apartment?: { id: string; name: string } | null };
        if (response.ok && data.apartment) setApartment(data.apartment);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-500">불러오는 중...</p>;
  }
  if (!apartment) {
    return <EmptyState icon="🏢" title="단지 정보를 불러오지 못했어요" description="새로고침해도 안 되면 대경이엔피로 문의해주세요." />;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xl font-bold text-dk-navy">세대전기점검(직무고시)</p>
        <p className="mt-0.5 text-[15px] font-medium text-slate-500">{apartment.name} · 공동주택 세대내 전기설비 점검기록표</p>
      </div>
      <UnitInspectionForm
        apartmentsEndpoint="/api/apt-manager/apartments-search"
        submitEndpoint="/api/apt-manager/unit-inspections"
        lockedApartment={apartment}
        backHref="/apt-manager/history"
        backLabel="점검이력 보기"
      />
    </div>
  );
}
