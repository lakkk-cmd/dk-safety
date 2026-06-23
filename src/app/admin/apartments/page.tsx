import AdminApartmentsManager from "@/components/admin-apartments-manager";
import { Card, CardContent } from "@/components/ui/card";
import AdminPageHeader from "@/components/admin/admin-page-header";

export default function AdminApartmentsPage() {
  return (
    <main className="page-fit max-w-6xl">
      <AdminPageHeader title="아파트 단지 관리" description="단지 코드, 단지명, 계좌/기본료를 관리하는 관리자 화면입니다." />
      <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardContent className="pt-6">
          <AdminApartmentsManager />
        </CardContent>
      </Card>
    </main>
  );
}
