import Link from "next/link";
import ResidentSafetyDashboard from "@/components/admin/resident/resident-safety-dashboard";
import AdminPageHeader from "@/components/admin/admin-page-header";

export default function AdminResidentSafetyPage() {
  return (
    <main className="page-fit max-w-6xl">
      <AdminPageHeader
        title="입주민 자가진단 통합 현황"
        description="단지별 위험도를 집계하고 고위험 입주민을 빠르게 확인합니다."
        badge="입주민 통합 모니터링"
        actions={
          <Link href="/admin/home" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-dk-navy shadow-sm transition hover:bg-slate-100">
            메인화면
          </Link>
        }
      />
      <ResidentSafetyDashboard />
    </main>
  );
}
