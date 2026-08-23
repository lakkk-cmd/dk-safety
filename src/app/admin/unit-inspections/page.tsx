import AdminUnitInspectionsPanel from "@/components/admin/admin-unit-inspections-panel";
import { Card, CardContent } from "@/components/ui/card";
import AdminPageHeader from "@/components/admin/admin-page-header";

export default function AdminUnitInspectionsPage() {
  return (
    <main className="page-fit max-w-6xl">
      <AdminPageHeader title="세대전기점검" description="직무고시 별지 15호 세대전기점검표 조회 및 PDF 발급." />
      <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardContent className="pt-6">
          <AdminUnitInspectionsPanel />
        </CardContent>
      </Card>
    </main>
  );
}
