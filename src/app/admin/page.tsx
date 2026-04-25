import Link from "next/link";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminConsoleLinks from "@/components/admin-console-links";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:py-14">
      <header className="surface-editorial mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-kicker">관리자 콘솔</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-950 md:text-4xl">예약 통합 관리</h1>
            <p className="mt-2 text-sm text-slate-600">아래 메뉴에서 관리 항목을 선택해 개별 페이지로 이동하세요.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin/resident-safety" className="btn-primary px-3 py-2 text-sm">
                입주민 자가진단 통합현황 보기
              </Link>
              <Link href="/worker/login" className="btn-outline px-3 py-2 text-sm">
                기사 현장 페이지
              </Link>
            </div>
            <AdminConsoleLinks />
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      <div className="surface-card rounded-2xl border border-slate-200 p-6">
        <h2 className="text-xl font-black text-slate-950">관리 메뉴</h2>
        <p className="mt-2 text-sm text-slate-600">
          예약/정산, 결제 계좌 설정, 기사 등록, 활동 로그, 백업 상태를 각각 독립 페이지로 분리했습니다.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Link href="/admin/reservations" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
            <p className="text-sm font-bold text-slate-900">예약/정산</p>
            <p className="mt-1 text-xs text-slate-600">예약 상태, 입금 상태, 기사 배정을 통합 관리합니다.</p>
          </Link>
          <Link href="/admin/payment-settings" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
            <p className="text-sm font-bold text-slate-900">결제 계좌 설정</p>
            <p className="mt-1 text-xs text-slate-600">입금 안내 계좌/예금주/기본 출장비를 수정합니다.</p>
          </Link>
          <Link href="/admin/workers" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
            <p className="text-sm font-bold text-slate-900">기사 등록</p>
            <p className="mt-1 text-xs text-slate-600">기사 로그인용 연락처와 PIN을 등록합니다.</p>
          </Link>
          <Link href="/admin/activity-logs" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
            <p className="text-sm font-bold text-slate-900">활동 로그</p>
            <p className="mt-1 text-xs text-slate-600">상태 변경, 메모 수정, 복원 이력을 조회합니다.</p>
          </Link>
          <Link href="/admin/backups" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50 md:col-span-2">
            <p className="text-sm font-bold text-slate-900">백업 상태</p>
            <p className="mt-1 text-xs text-slate-600">스냅샷 확인, 수동 백업, 복원/롤백을 수행합니다.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
