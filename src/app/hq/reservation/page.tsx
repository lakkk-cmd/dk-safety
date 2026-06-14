import { getKstDateTime } from "@/lib/agent-schedule";
import { readReservations } from "@/lib/reservations-store";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  waiting_payment: "입금대기",
  접수: "접수",
  진행중: "진행중",
  완료: "완료",
};

const STATUS_BADGE: Record<string, string> = {
  waiting_payment: "bg-slate-100 text-slate-600",
  접수: "bg-sky-100 text-sky-800",
  진행중: "bg-cc-gold/10 text-cc-navy",
  완료: "bg-cc-green/10 text-cc-green",
};

function fmtWon(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}

export default async function HqReservationPage() {
  const reservations = await readReservations();
  const kst = getKstDateTime();

  const todayCount = reservations.filter((r) => r.preferredDate === kst.dateKey).length;
  const totalAmount = reservations.reduce((sum, r) => sum + r.totalAmount, 0);
  const unpaid = reservations.filter((r) => !r.isPaid);
  const unpaidAmount = unpaid.reduce((sum, r) => sum + r.totalAmount, 0);
  const emergencyCount = reservations.filter((r) => r.priority === "emergency").length;

  const recent = [...reservations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30);

  return (
    <main className="space-y-6">
      <header className="cc-card p-6 md:p-8">
        <p className="inline-flex rounded-full bg-cc-navy px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
          예약 · 정산 현황
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.02em] text-cc-text md:text-3xl">예약 {reservations.length}건</h1>
        <p className="mt-2 text-sm text-slate-600">오늘({kst.dateKey}) 예약 {todayCount}건 · 미수금 {unpaid.length}건</p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="cc-card p-4 text-center">
          <p className="text-xs font-bold text-slate-500">총 매출(누적)</p>
          <p className="mt-1 text-lg font-black text-cc-text">{fmtWon(totalAmount)}</p>
        </div>
        <div className="cc-card p-4 text-center">
          <p className="text-xs font-bold text-slate-500">미수금</p>
          <p className="mt-1 text-lg font-black text-cc-red">{fmtWon(unpaidAmount)}</p>
        </div>
        <div className="cc-card p-4 text-center">
          <p className="text-xs font-bold text-slate-500">오늘 예약</p>
          <p className="mt-1 text-lg font-black text-cc-text">{todayCount}건</p>
        </div>
        <div className="cc-card p-4 text-center">
          <p className="text-xs font-bold text-slate-500">긴급출동</p>
          <p className="mt-1 text-lg font-black text-cc-text">{emergencyCount}건</p>
        </div>
      </section>

      <section className="cc-card p-6">
        <h2 className="text-base font-black text-cc-text">최근 예약 (최대 30건)</h2>
        {recent.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">등록된 예약이 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {recent.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-100 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-cc-text">
                    {r.name} · {r.serviceType}
                    {r.priority === "emergency" ? (
                      <span className="ml-2 rounded bg-cc-red/10 px-1.5 py-0.5 text-xs font-bold text-cc-red">긴급</span>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-2">
                    {!r.isPaid ? (
                      <span className="rounded bg-cc-gold/10 px-1.5 py-0.5 text-xs font-bold text-cc-navy">미수금</span>
                    ) : null}
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${STATUS_BADGE[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {r.preferredDate} {r.preferredTime} · {r.address}
                </p>
                <p className="mt-1 text-xs font-semibold text-cc-text">{fmtWon(r.totalAmount)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
