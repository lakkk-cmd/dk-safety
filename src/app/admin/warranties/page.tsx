import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSupabaseAdmin, isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

type WarrantyRow = {
  id: string;
  warranty_number: string | null;
  warranty_no: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  issued_at: string | null;
  verify_url: string | null;
  status: string | null;
};

export default async function AdminWarrantiesPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <section className="space-y-4">
        <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-slate-100">Digital Warranties</CardTitle>
            <CardDescription className="dark:text-slate-300">Supabase DB 모드에서 보증서 관제를 사용할 수 있습니다.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const supabase = requireSupabaseAdmin();
  const { data } = await supabase
    .from("warranties")
    .select("id, warranty_number, warranty_no, issue_date, expiry_date, issued_at, verify_url, status")
    .order("issued_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as WarrantyRow[];

  return (
    <section className="space-y-4">
      <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Digital Warranties</CardTitle>
          <CardDescription className="dark:text-slate-300">
            보증서 발급 이력 조회와 보증번호 기반 진위 확인을 수행합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">보증번호</th>
                  <th className="px-3 py-2">발급일</th>
                  <th className="px-3 py-2">만료일</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">검증</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const number = row.warranty_no ?? row.warranty_number ?? "-";
                  return (
                    <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2 font-semibold">{number}</td>
                      <td className="px-3 py-2">{row.issue_date ?? row.issued_at?.slice(0, 10) ?? "-"}</td>
                      <td className="px-3 py-2">{row.expiry_date ?? "-"}</td>
                      <td className="px-3 py-2">{row.status ?? "ISSUED"}</td>
                      <td className="px-3 py-2">
                        {row.verify_url ? (
                          <a href={row.verify_url} className="text-indigo-700 underline dark:text-indigo-300">
                            확인
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
