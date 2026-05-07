"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChartColumn,
  ClipboardCheck,
  CreditCard,
  FileBadge,
  ShieldUser,
  UserCog
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { ApartmentTenant } from "@/lib/apartments-pg";
import type { AdminOrderRow } from "@/lib/orders-pg";
import type { WorkerPublic } from "@/lib/reservations-pg";
import type { Reservation } from "@/lib/reservations-store";
import { finalPaymentStatusKo, orderPaymentStatusKo, taskStatusKo } from "@/lib/admin-customer-care-display";

type SectionKey =
  | "apartment-master"
  | "finance-gateway"
  | "dispatch-control"
  | "adjustment-billing"
  | "digital-warranty"
  | "technician-hr"
  | "insight-config";

type Snapshot = {
  apartments: ApartmentTenant[];
  orders: AdminOrderRow[];
  reservations: Reservation[];
  workers: WorkerPublic[];
};

const sectionMeta: Array<{ key: SectionKey; label: string; icon: typeof Building2 }> = [
  { key: "apartment-master", label: "아파트 단지 관리", icon: Building2 },
  { key: "finance-gateway", label: "입금/가상계좌 관리", icon: CreditCard },
  { key: "dispatch-control", label: "실시간 배정 관제", icon: ClipboardCheck },
  { key: "adjustment-billing", label: "현장 정산 승인", icon: ChartColumn },
  { key: "digital-warranty", label: "디지털 보증서 관리", icon: FileBadge },
  { key: "technician-hr", label: "기사/인증 관리", icon: UserCog },
  { key: "insight-config", label: "시스템 통계 및 설정", icon: ShieldUser }
];

function filterByDongHoAndApartment(params: {
  apartmentFilter: string;
  donghoFilter: string;
  apartmentName?: string | null;
  dong?: string | null;
  ho?: string | null;
}) {
  const aptOk =
    !params.apartmentFilter.trim() || (params.apartmentName ?? "").toLowerCase().includes(params.apartmentFilter.toLowerCase());
  const dongho = `${params.dong ?? ""}${params.ho ? `-${params.ho}` : ""}`.toLowerCase();
  const donghoOk = !params.donghoFilter.trim() || dongho.includes(params.donghoFilter.toLowerCase());
  return aptOk && donghoOk;
}

export default function AdminUnifiedConsole({ initial }: { initial: Snapshot }) {
  const [section, setSection] = useState<SectionKey>("apartment-master");
  const [data, setData] = useState<Snapshot>(initial);
  const [apartmentFilter, setApartmentFilter] = useState("");
  const [donghoFilter, setDonghoFilter] = useState("");
  const [syncMessage, setSyncMessage] = useState("실시간 동기화 대기 중");

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};
    const refresh = async () => {
      try {
        const response = await fetch("/api/admin/console-snapshot", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as Snapshot;
        if (disposed) return;
        setData(next);
        setSyncMessage(`동기화 완료 · ${new Date().toLocaleTimeString("ko-KR")}`);
      } catch {
        if (!disposed) setSyncMessage("동기화 실패 - 자동 재시도 중");
      }
    };
    void refresh();

    try {
      const supabase = createBrowserSupabase();
      const channel = supabase
        .channel("admin-unified-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
          void refresh();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => {
          void refresh();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
          void refresh();
        })
        .subscribe();
      unsubscribe = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // ignore
    }

    const pollId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, 6000);
    return () => {
      disposed = true;
      window.clearInterval(pollId);
      unsubscribe();
    };
  }, []);

  const apartmentsById = useMemo(() => new Map(data.apartments.map((a) => [a.id, a])), [data.apartments]);

  const financeRows = useMemo(() => {
    return data.orders.filter((order) => {
      const aptName = apartmentsById.get(order.apt_id ?? "")?.name ?? "미지정";
      const resident = order.resident_info ?? {};
      return filterByDongHoAndApartment({
        apartmentFilter,
        donghoFilter,
        apartmentName: aptName,
        dong: typeof resident.dong === "string" ? resident.dong : "",
        ho: typeof resident.ho === "string" ? resident.ho : ""
      });
    });
  }, [data.orders, apartmentsById, apartmentFilter, donghoFilter]);

  const dispatchRows = useMemo(() => {
    return data.reservations.filter((reservation) => {
      const [dongPart = "", hoPart = ""] = reservation.address.match(/(\d+)동\s*(\d+)호/)?.slice(1) ?? [];
      const passFilter = filterByDongHoAndApartment({
        apartmentFilter,
        donghoFilter,
        apartmentName: reservation.apartmentName ?? "미지정",
        dong: dongPart,
        ho: hoPart
      });
      if (!passFilter) return false;
      const order = data.orders.find((o) => o.reservation_id === reservation.id);
      const paid = order?.payment_status === "PAID" || reservation.isPaid;
      return paid;
    });
  }, [data.reservations, data.orders, apartmentFilter, donghoFilter]);

  const adjustmentRows = useMemo(() => {
    return data.orders
      .map((order) => {
        const reservation = data.reservations.find((r) => r.id === order.reservation_id);
        if (!reservation) return null;
        const resident = order.resident_info ?? {};
        const aptName = reservation.apartmentName ?? apartmentsById.get(order.apt_id ?? "")?.name ?? "미지정";
        const passFilter = filterByDongHoAndApartment({
          apartmentFilter,
          donghoFilter,
          apartmentName: aptName,
          dong: typeof resident.dong === "string" ? resident.dong : "",
          ho: typeof resident.ho === "string" ? resident.ho : ""
        });
        if (!passFilter) return null;
        return {
          order,
          reservation,
          extra: Math.max(0, (order.total_final_fee ?? reservation.totalAmount) - (order.base_fee ?? reservation.baseFee))
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [data.orders, data.reservations, apartmentsById, apartmentFilter, donghoFilter]);

  const apartmentSales = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>();
    for (const order of data.orders) {
      const apt = apartmentsById.get(order.apt_id ?? "");
      const key = apt?.id ?? "none";
      const current = map.get(key) ?? { name: apt?.name ?? "미지정", amount: 0, count: 0 };
      current.amount += order.total_final_fee ?? order.base_fee ?? 0;
      current.count += 1;
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 6);
  }, [data.orders, apartmentsById]);

  const maxSales = Math.max(1, ...apartmentSales.map((s) => s.amount));

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">관리자 사이드바</CardTitle>
          <CardDescription>7대 관리 메뉴</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sectionMeta.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.key}
                onClick={() => setSection(item.key)}
                variant={section === item.key ? "default" : "outline"}
                className={cn("h-auto w-full justify-start whitespace-normal py-2 text-left", section === item.key && "border-dk-navy")}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{sectionMeta.find((s) => s.key === section)?.label}</CardTitle>
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">{syncMessage}</Badge>
          </div>
          </CardHeader>
          <CardContent>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="단지명 필터 (즉시 검색)"
              value={apartmentFilter}
              onChange={(e) => setApartmentFilter(e.target.value)}
            />
            <Input
              placeholder="동/호수 필터 (예: 101-502)"
              value={donghoFilter}
              onChange={(e) => setDonghoFilter(e.target.value)}
            />
          </div>
          </CardContent>
        </Card>

        {section === "apartment-master" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">단지별 설정 테이블</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr>
                    <th className="px-3 py-2">단지명</th>
                    <th className="px-3 py-2">코드</th>
                    <th className="px-3 py-2">기본 출장비</th>
                    <th className="px-3 py-2">관리실 계좌</th>
                  </tr>
                </thead>
                <tbody>
                  {data.apartments
                    .filter((a) => !apartmentFilter.trim() || a.name.toLowerCase().includes(apartmentFilter.toLowerCase()))
                    .map((apt) => (
                      <tr key={apt.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold">{apt.name}</td>
                        <td className="px-3 py-2">{apt.code}</td>
                        <td className="px-3 py-2">{apt.baseFee.toLocaleString("ko-KR")}원</td>
                        <td className="px-3 py-2">{apt.bankInfo.bankName} {apt.bankInfo.accountNumber}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "finance-gateway" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">가상계좌/입금 상태</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr>
                    <th className="px-3 py-2">단지명</th>
                    <th className="px-3 py-2">동/호수</th>
                    <th className="px-3 py-2">가상계좌</th>
                    <th className="px-3 py-2">입금금액</th>
                    <th className="px-3 py-2">결제상태</th>
                  </tr>
                </thead>
                <tbody>
                  {financeRows.map((order) => {
                    const aptName = apartmentsById.get(order.apt_id ?? "")?.name ?? "미지정";
                    const resident = order.resident_info ?? {};
                    return (
                      <tr key={order.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold">{aptName}</td>
                        <td className="px-3 py-2">{resident.dong ?? "-"}-{resident.ho ?? "-"}</td>
                        <td className="px-3 py-2">{order.virtual_account_number ?? "-"}</td>
                        <td className="px-3 py-2">{(order.virtual_account_amount ?? order.base_fee ?? 0).toLocaleString("ko-KR")}원</td>
                        <td className="px-3 py-2 font-bold">{orderPaymentStatusKo(order.payment_status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "dispatch-control" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">배정 관제 리스트 (입금 완료 건 실시간 반영)</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr>
                    <th className="px-3 py-2">단지명</th>
                    <th className="px-3 py-2">동/호수</th>
                    <th className="px-3 py-2">고객</th>
                    <th className="px-3 py-2">상태</th>
                    <th className="px-3 py-2">기사</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatchRows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold">{r.apartmentName ?? "미지정"}</td>
                      <td className="px-3 py-2">{r.address.match(/(\d+동\s*\d+호)/)?.[1] ?? "-"}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 font-bold">
                        {r.taskStatus ? `배정완료(${taskStatusKo(r.taskStatus)})` : "배정대기"}
                      </td>
                      <td className="px-3 py-2">{r.assignedWorkerName ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "adjustment-billing" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">현장 정산 승인/차액 결제</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr>
                    <th className="px-3 py-2">단지명</th>
                    <th className="px-3 py-2">동/호수</th>
                    <th className="px-3 py-2">총 정산</th>
                    <th className="px-3 py-2">차액</th>
                    <th className="px-3 py-2">최종결제상태</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustmentRows.map(({ order, reservation, extra }) => {
                    const resident = order.resident_info ?? {};
                    return (
                      <tr key={order.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold">{reservation.apartmentName ?? "미지정"}</td>
                        <td className="px-3 py-2">{resident.dong ?? "-"}-{resident.ho ?? "-"}</td>
                        <td className="px-3 py-2">{(order.total_final_fee ?? reservation.totalAmount).toLocaleString("ko-KR")}원</td>
                        <td className="px-3 py-2 font-bold text-amber-700">{extra.toLocaleString("ko-KR")}원</td>
                        <td className="px-3 py-2">{finalPaymentStatusKo(order.final_payment_status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "digital-warranty" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">디지털 보증서 관리</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr>
                    <th className="px-3 py-2">단지명</th>
                    <th className="px-3 py-2">동/호수</th>
                    <th className="px-3 py-2">보증서 발급시각</th>
                    <th className="px-3 py-2">보증상태</th>
                  </tr>
                </thead>
                <tbody>
                  {financeRows
                    .filter((order) => Boolean(order.warranty_issued_at))
                    .map((order) => {
                      const aptName = apartmentsById.get(order.apt_id ?? "")?.name ?? "미지정";
                      const resident = order.resident_info ?? {};
                      return (
                        <tr key={order.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-semibold">{aptName}</td>
                          <td className="px-3 py-2">{resident.dong ?? "-"}-{resident.ho ?? "-"}</td>
                          <td className="px-3 py-2">{order.warranty_issued_at ? new Date(order.warranty_issued_at).toLocaleString("ko-KR") : "-"}</td>
                          <td className="px-3 py-2 font-bold">
                            {order.final_payment_status === "PAID" ? "발급 완료" : "미발급"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "technician-hr" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">기사/인증 관리</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr>
                    <th className="px-3 py-2">기사명</th>
                    <th className="px-3 py-2">연락처</th>
                    <th className="px-3 py-2">활성</th>
                    <th className="px-3 py-2">등록일</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workers.map((worker) => (
                    <tr key={worker.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold">{worker.name}</td>
                      <td className="px-3 py-2">{worker.phone}</td>
                      <td className="px-3 py-2">{worker.active ? "활성" : "비활성"}</td>
                      <td className="px-3 py-2">{new Date(worker.createdAt).toLocaleDateString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "insight-config" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">단지별 매출/이용 통계</CardTitle>
            </CardHeader>
            <CardContent>
            <Separator className="mb-4" />
            <div className="mt-4 space-y-3">
              {apartmentSales.map((row) => (
                <div key={row.name}>
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>{row.name}</span>
                    <span>{row.amount.toLocaleString("ko-KR")}원 · {row.count}건</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100">
                    <div className="h-3 rounded-full bg-gradient-to-r from-dk-navy to-dk-blue" style={{ width: `${Math.max(4, Math.round((row.amount / maxSales) * 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
