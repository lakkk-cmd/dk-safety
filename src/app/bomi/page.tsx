import Link from "next/link";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { listBomiCustomers } from "@/lib/bomi-db";
import CustomerListFilters from "./customer-list-filters";

export default async function BomiDashboardPage() {
  if (!isAgentSupabaseReady()) {
    return (
      <div className="surface-card mt-6 rounded-2xl p-6 text-sm text-slate-600">
        Supabase가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 확인해주세요.
      </div>
    );
  }

  const customers = await listBomiCustomers();

  return (
    <div className="space-y-6 py-6">
      <div className="surface-card-strong rounded-2xl p-6">
        <p className="section-kicker">대시보드</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">전체 고객 {customers.length}명</h1>
        <p className="mt-2 text-sm text-slate-600">
          고객카드, 문서 캐비닛(증권 스캔 포함), AI 보장분석까지 — Phase 1 MVP 기능입니다.
        </p>
        <Link href="/customers/new" className="btn-primary mt-4 inline-block px-4 py-2 text-sm">
          새 고객 등록
        </Link>
      </div>

      <div className="surface-card rounded-2xl p-6">
        <h2 className="text-lg font-bold text-slate-950">고객 목록</h2>
        {customers.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">아직 등록된 고객이 없습니다.</p>
        ) : (
          <CustomerListFilters customers={customers} />
        )}
      </div>
    </div>
  );
}
