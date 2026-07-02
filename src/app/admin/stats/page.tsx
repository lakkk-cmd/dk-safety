import { Card, CardContent } from "@/components/ui/card";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { pgListApartments } from "@/lib/apartments-pg";
import { pgListOrdersForAdmin } from "@/lib/orders-pg";
import { pgReadReservations } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { listCodeReviewLogs } from "@/lib/code-review";
import type { CodeReviewLog } from "@/lib/code-review";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

export const dynamic = "force-dynamic";

type ProjectFeatureRow = { category: string; status: string; name: string; description: string };
type ProjectContextMeta = { generated_at: string } | null;

async function loadProjectFeatures(): Promise<{ features: ProjectFeatureRow[]; cacheMeta: ProjectContextMeta }> {
  if (!isAgentSupabaseReady()) return { features: [], cacheMeta: null };
  const supabase = requireAgentSupabase();
  const [{ data: features }, { data: cache }] = await Promise.all([
    supabase.from("project_features").select("category, status, name, description"),
    supabase.from("project_context_cache").select("generated_at").eq("context_type", "gemini_context").maybeSingle(),
  ]);
  return { features: (features as ProjectFeatureRow[]) ?? [], cacheMeta: cache ?? null };
}

export default async function AdminStatsPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <main className="page-fit max-w-6xl">
        <AdminPageHeader title="시스템 통계" description="Supabase DB 모드에서 통계 관제를 사용할 수 있습니다." />
      </main>
    );
  }

  const [apartments, orders, reservations, reviewLogs, { features, cacheMeta }] = await Promise.all([
    pgListApartments(),
    pgListOrdersForAdmin(),
    pgReadReservations(),
    listCodeReviewLogs(15),
    loadProjectFeatures(),
  ]);
  const totalRevenue = orders.reduce((sum, order) => sum + (order.total_final_fee ?? order.base_fee ?? 0), 0);
  const paidCount = orders.filter((order) => order.payment_status === "PAID").length;
  const completionCount = reservations.filter((reservation) => reservation.status === "완료").length;
  const implementedFeatures = features.filter((f) => f.status === "implemented");
  const pendingFeatures = features.filter((f) => f.status === "pending");
  const deprecatedCount = features.filter((f) => f.status === "deprecated").length;
  const integrationCount = implementedFeatures.filter((f) => f.category === "integration").length;
  const apartmentMetrics = apartments.map((apt) => {
    const aptOrders = orders.filter((order) => order.apt_id === apt.id);
    return {
      id: apt.id,
      name: apt.name,
      count: aptOrders.length,
      amount: aptOrders.reduce((sum, row) => sum + (row.total_final_fee ?? row.base_fee ?? 0), 0)
    };
  });

  return (
    <main className="page-fit max-w-6xl">
      <AdminPageHeader title="시스템 통계" description="단지별 매출, 이용률, 운영 지표를 모니터링하는 통계 영역입니다." />
      <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">총 매출</p>
              <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{totalRevenue.toLocaleString("ko-KR")}원</p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">결제 완료 주문</p>
              <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{paidCount}건</p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">완료된 예약</p>
              <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{completionCount}건</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">단지명</th>
                  <th className="px-3 py-2">주문수</th>
                  <th className="px-3 py-2">누적 매출</th>
                </tr>
              </thead>
              <tbody>
                {apartmentMetrics
                  .sort((a, b) => b.amount - a.amount)
                  .map((row) => (
                    <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">{row.count}건</td>
                      <td className="px-3 py-2 font-semibold">{row.amount.toLocaleString("ko-KR")}원</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {/* Gemini 학습 컨텍스트 현황 */}
      <Card className="mt-6 border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">🧠 Gemini 학습 컨텍스트 현황</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              마지막 갱신: {cacheMeta ? new Date(cacheMeta.generated_at).toLocaleString("ko-KR") : "미생성"}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">구현된 기능</p>
              <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{implementedFeatures.length}개</p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">미구현/예정</p>
              <p className="mt-1 text-lg font-black text-amber-600">{pendingFeatures.length}개</p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">연동 서비스</p>
              <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{integrationCount}개</p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">Deprecated</p>
              <p className="mt-1 text-lg font-black text-slate-400">{deprecatedCount}개</p>
            </div>
          </div>
          {pendingFeatures.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                미구현 기능 — 풀 에이전트 채팅이 &ldquo;가능합니다&rdquo;라고 안내하면 안 되는 목록
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pendingFeatures.map((f) => (
                  <span
                    key={f.name}
                    title={f.description}
                    className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  >
                    {f.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 코드 리뷰 이력 */}
      <Card className="mt-6 border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardContent className="pt-6">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
            🤖 Gemini 코드 리뷰 이력
          </h2>
          {reviewLogs.length === 0 ? (
            <p className="text-xs text-slate-500">아직 코드 리뷰 기록이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    <th className="px-3 py-2">커밋</th>
                    <th className="px-3 py-2">변경 파일</th>
                    <th className="px-3 py-2 text-center">점수</th>
                    <th className="px-3 py-2 text-center">판정</th>
                    <th className="px-3 py-2">일시</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewLogs.map((log: CodeReviewLog) => {
                    const score = log.meta?.score ?? 0;
                    const passed = log.meta?.passed ?? false;
                    const files = log.meta?.files ?? [];
                    const commit = log.meta?.commit ?? "-";
                    return (
                      <tr key={log.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{commit}</td>
                        <td className="px-3 py-2 max-w-[280px]">
                          <p className="truncate text-xs text-slate-700 dark:text-slate-300">
                            {files.length > 0 ? files[0] : "-"}
                          </p>
                          {files.length > 1 && (
                            <p className="text-[10px] text-slate-400">외 {files.length - 1}개</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`font-bold ${score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-600"}`}>
                            {score}점
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {passed ? (
                            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">✅ 통과</span>
                          ) : (
                            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">❌ 반려</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {new Date(log.created_at).toLocaleString("ko-KR")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
