import Link from "next/link";
import ResidentSafetyDashboard from "@/components/admin/resident/resident-safety-dashboard";
import AdminLogoutButton from "@/components/admin-logout-button";

export default function AdminResidentSafetyPage() {
  return (
    <main className="page-fit max-w-6xl">
      <div className="surface-editorial mb-6 flex items-center justify-between rounded-[2rem] p-6 md:p-8">
        <div>
          <p className="section-kicker">입주민 통합 모니터링</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-950 md:text-4xl">입주민 자가진단 통합 현황</h1>
          <p className="mt-2 text-sm text-slate-600">단지별 위험도를 집계하고 고위험 입주민을 빠르게 확인합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/home" className="btn-outline px-3 py-2 text-sm">
            메인화면
          </Link>
          <AdminLogoutButton />
        </div>
      </div>
      <ResidentSafetyDashboard />
    </main>
  );
}
