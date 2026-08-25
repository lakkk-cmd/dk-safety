import AptManagerInspectionHistory from "@/components/apt-manager/apt-manager-inspection-history";

export default function AptManagerHistoryPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xl font-bold text-dk-navy">점검이력</p>
        <p className="mt-0.5 text-[15px] font-medium text-slate-500">우리 단지 세대전기점검 처리 현황</p>
      </div>
      <AptManagerInspectionHistory />
    </div>
  );
}
