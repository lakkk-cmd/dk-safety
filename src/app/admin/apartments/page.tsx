import AdminApartmentsManager from "@/components/admin-apartments-manager";
import AdminApartmentManagersPanel from "@/components/admin/admin-apartment-managers-panel";
import { Card, CardContent } from "@/components/ui/card";
import AdminPageHeader from "@/components/admin/admin-page-header";

export default function AdminApartmentsPage() {
  return (
    <main className="page-fit max-w-6xl space-y-6">
      <div>
        <AdminPageHeader title="아파트 단지 관리" description="단지 코드, 단지명, 계좌/기본료를 관리하는 관리자 화면입니다." />
        <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
          <CardContent className="pt-6">
            <AdminApartmentsManager />
          </CardContent>
        </Card>
      </div>
      <div>
        <AdminPageHeader
          title="전기과장 계정 관리"
          description="세대전기점검 무료앱(inspect.dkansim.com) 가입신청 승인·비밀번호 재발급 화면입니다."
        />
        <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
          <CardContent className="pt-6">
            <AdminApartmentManagersPanel />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
