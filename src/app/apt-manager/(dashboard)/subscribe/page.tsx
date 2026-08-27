import AptManagerSubscribePanel from "@/components/apt-manager/apt-manager-subscribe-panel";

export default function AptManagerSubscribePage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xl font-bold text-dk-navy">구독관리</p>
        <p className="mt-0.5 text-[15px] font-medium text-slate-500">점검표 PDF 다운로드 이용권</p>
      </div>
      <AptManagerSubscribePanel />
    </div>
  );
}
