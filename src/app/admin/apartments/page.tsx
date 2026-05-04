import AdminApartmentsManager from "@/components/admin-apartments-manager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminApartmentsPage() {
  return (
    <section className="space-y-4">
      <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Apartment Master</CardTitle>
          <CardDescription className="dark:text-slate-300">
            단지 코드, 단지명, 계좌/기본료를 관리하는 관리자 화면입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminApartmentsManager />
        </CardContent>
      </Card>
    </section>
  );
}
