import { siteConfig } from "@/lib/site-config";

export default function AptManagerPendingPage() {
  return (
    <main className="page-fit flex max-w-md flex-col justify-center bg-slate-100">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-lg">
        <p className="text-4xl">⏳</p>
        <h1 className="mt-3 text-xl font-black text-slate-950">가입신청 승인 대기중이에요</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          대표님이 관리사무소로 전화드려 실존확인 후 승인해드려요.
          <br />
          보통 <b>1~2일 이내</b>로 연락드립니다.
        </p>
        <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-400">문의</p>
          <p className="mt-1 text-lg font-bold text-dk-navy">{siteConfig.businessPhone}</p>
        </div>
      </div>
    </main>
  );
}
