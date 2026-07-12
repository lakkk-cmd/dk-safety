import AdminAccountPanel from "@/components/admin/admin-account-panel";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { pgListAdminAccounts } from "@/lib/admin-accounts-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default async function AdminAccountPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <main className="page-fit max-w-6xl">
        <AdminPageHeader title="관리자 계정 관리" description="Supabase DB 모드에서 관리자 계정 관리를 사용할 수 있습니다." />
      </main>
    );
  }

  const accounts = await pgListAdminAccounts();

  return (
    <main className="page-fit max-w-6xl space-y-4">
      <AdminPageHeader title="관리자 계정 관리" description="관리자 계정을 등록하고 이름/연락처/비밀번호를 관리합니다." />
      <AdminAccountPanel initialAccounts={accounts} />
    </main>
  );
}
