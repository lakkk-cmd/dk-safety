import AptManagerInfoPanel from "@/components/apt-manager/apt-manager-info-panel";

export default function AptManagerInfoPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xl font-bold text-dk-navy">정보관리</p>
        <p className="mt-0.5 text-[15px] font-medium text-slate-500">담당자 개인정보 수정 · 비밀번호 변경</p>
      </div>
      <AptManagerInfoPanel />
    </div>
  );
}
