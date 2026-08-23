import UnitInspectionForm from "@/components/worker/unit-inspection-form";

export default function WorkerUnitInspectionPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xl font-bold text-dk-navy">세대전기점검(직무고시)</p>
        <p className="mt-0.5 text-[15px] font-medium text-slate-500">공동주택 세대내 전기설비 점검기록표</p>
      </div>
      <UnitInspectionForm />
    </div>
  );
}
