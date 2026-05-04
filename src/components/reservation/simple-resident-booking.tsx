"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Bolt, Lightbulb, PlugZap, Wrench } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import LiveNotificationToast from "@/components/live/live-notification-toast";

type ApartmentInfo = {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
  baseFee: number;
};

type ServiceItemInfo = {
  id: string;
  serviceType: string;
  name: string;
  minFee: number | null;
  maxFee: number | null;
};

type Props = {
  apartment: ApartmentInfo;
};

const problemOptions = [
  { key: "콘센트/스위치 수리", label: "콘센트/스위치", icon: PlugZap, color: "bg-blue-50 border-blue-200 text-blue-800" },
  { key: "전등기구 교체", label: "전등", icon: Lightbulb, color: "bg-amber-50 border-amber-200 text-amber-800" },
  { key: "누전/차단기 점검", label: "누전/차단기", icon: Bolt, color: "bg-rose-50 border-rose-200 text-rose-800" },
  { key: "기타 점검", label: "기타 점검", icon: Wrench, color: "bg-emerald-50 border-emerald-200 text-emerald-800" }
] as const;

type FlowStatus = "draft" | "pending_payment" | "assigned_waiting" | "assigned_done";

export default function SimpleResidentBooking({ apartment }: Props) {
  const [serviceItems, setServiceItems] = useState<ServiceItemInfo[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<(typeof problemOptions)[number]["key"] | "">("");
  const [residentName, setResidentName] = useState("");
  const [residentPhone, setResidentPhone] = useState("");
  const [dong, setDong] = useState("");
  const [ho, setHo] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("draft");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/public/apt/${encodeURIComponent(apartment.code)}/service-items`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { serviceItems?: ServiceItemInfo[] };
        setServiceItems(data.serviceItems ?? []);
      } catch {
        // ignore
      }
    })();
  }, [apartment.code]);

  useEffect(() => {
    if (!reservationId) return;
    let unsubscribe = () => {};
    try {
      const supabase = createBrowserSupabase();
      const channel = supabase
        .channel(`reservation-watch-${reservationId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "reservations", filter: `id=eq.${reservationId}` },
          (payload) => {
            const row = payload.new as { prepayment_confirmed?: boolean; payment_status?: string };
            if (row.prepayment_confirmed) {
              if (row.payment_status === "ASSIGNED" || row.payment_status === "IN_PROGRESS" || row.payment_status === "SETTLED") {
                setFlowStatus("assigned_done");
              } else {
                setFlowStatus("assigned_waiting");
              }
            }
          }
        )
        .subscribe();
      unsubscribe = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // ignore realtime setup failure
    }
    return () => unsubscribe();
  }, [reservationId]);

  const selectedFeeRange = useMemo(() => {
    if (!selectedProblem) return "";
    const key =
      selectedProblem.includes("콘센트") || selectedProblem.includes("스위치")
        ? "OUTLET"
        : selectedProblem.includes("전등")
          ? "LIGHT"
          : selectedProblem.includes("누전") || selectedProblem.includes("차단기")
            ? "LEAKAGE"
            : "VISIT";
    const item = serviceItems.find((row) => row.serviceType === key);
    if (!item || item.minFee === null || item.maxFee === null) return "예상 기술료 정보 준비 중";
    if (item.minFee === item.maxFee) return `예상 기술료 ${item.minFee.toLocaleString("ko-KR")}원`;
    return `예상 기술료 ${item.minFee.toLocaleString("ko-KR")} ~ ${item.maxFee.toLocaleString("ko-KR")}원`;
  }, [selectedProblem, serviceItems]);

  const canCreateReservation = Boolean(selectedProblem && residentName.trim() && residentPhone.trim() && dong.trim() && ho.trim());

  const createReservation = async () => {
    if (!canCreateReservation) return;
    setLoading(true);
    setMessage("");
    try {
      const now = new Date();
      const next = new Date(now.getTime() + 60 * 60 * 1000);
      const preferredDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      const preferredTime = `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;

      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartmentId: apartment.id,
          apartmentName: apartment.name,
          apartmentCode: apartment.code,
          name: residentName.trim(),
          phone: residentPhone.trim(),
          address: `${apartment.name} ${dong.trim()}동 ${ho.trim()}호`,
          serviceType: selectedProblem,
          preferredDate,
          preferredTime,
          detail: `${selectedProblem} 아이콘 선택 접수`
        })
      });
      const data = (await response.json()) as { message?: string; reservation?: { id?: string } };
      if (!response.ok || !data.reservation?.id) {
        throw new Error(data.message ?? "접수 생성 실패");
      }
      setReservationId(data.reservation.id);
      setFlowStatus("pending_payment");
      setMessage("접수 대기 상태입니다. 아래 결제 버튼을 눌러주세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "접수 생성 실패");
    } finally {
      setLoading(false);
    }
  };

  const confirmPayment = async () => {
    if (!reservationId) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/reservations/${encodeURIComponent(reservationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPaid: true,
          prepaymentTxId: `DK-${Date.now()}`,
          paidAmount: 50000
        })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "결제 확인 실패");
      setFlowStatus("assigned_waiting");
      setMessage("입금 확인 완료. 기사 배정 중입니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "결제 처리 실패");
    } finally {
      setLoading(false);
    }
  };

  const currentStep = flowStatus === "draft" ? 1 : flowStatus === "pending_payment" ? 4 : 4;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 pb-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          {apartment.logoUrl ? (
            <Image src={apartment.logoUrl} alt={`${apartment.name} 로고`} width={64} height={64} className="h-16 w-16 rounded-xl object-contain" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-2xl">🏢</div>
          )}
          <div>
            <p className="text-sm font-bold text-slate-900">{apartment.name} 주민님, 대경 안심 전기가 방문합니다.</p>
            <p className="text-xs text-slate-600">기본 출장비 50,000원</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-black text-slate-900">진행 단계</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {["1 자동 식별", "2 문제 선택", "3 정보 입력", "4 예약금 결제/배정"].map((step, idx) => (
            <div
              key={step}
              className={`rounded-xl px-2 py-3 text-xs font-bold ${
                idx + 1 === currentStep ? "animate-pulse bg-primary text-white" : idx + 1 < currentStep ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
              }`}
            >
              {step}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-black text-slate-900">Step 2. 문제 선택</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {problemOptions.map((option) => {
            const Icon = option.icon;
            const active = selectedProblem === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setSelectedProblem(option.key)}
                className={`h-20 rounded-2xl border px-3 text-left text-base font-black ${active ? "border-primary bg-primary text-white" : option.color}`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-6 w-6" />
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
        {selectedProblem ? <p className="mt-2 text-xs text-slate-600">{selectedFeeRange}</p> : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-black text-slate-900">Step 3. 정보 입력 (3가지만)</p>
        <div className="mt-3 grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={dong}
              onChange={(e) => setDong(e.target.value.replaceAll(/[^0-9]/g, ""))}
              placeholder="동 (예: 101)"
              className="h-14 rounded-xl border border-slate-300 px-4 text-base"
            />
            <input
              value={ho}
              onChange={(e) => setHo(e.target.value.replaceAll(/[^0-9]/g, ""))}
              placeholder="호수 (예: 1203)"
              className="h-14 rounded-xl border border-slate-300 px-4 text-base"
            />
          </div>
          <input value={residentName} onChange={(e) => setResidentName(e.target.value)} placeholder="성명" className="h-14 rounded-xl border border-slate-300 px-4 text-base" />
          <input value={residentPhone} onChange={(e) => setResidentPhone(e.target.value)} placeholder="연락처 (010-0000-0000)" className="h-14 rounded-xl border border-slate-300 px-4 text-base" />
        </div>
        {!reservationId ? (
          <button type="button" disabled={!canCreateReservation || loading} onClick={() => void createReservation()} className="mt-3 h-20 w-full rounded-2xl bg-slate-900 text-lg font-black text-white disabled:opacity-50">
            {loading ? "접수 생성 중..." : "접수 만들기"}
          </button>
        ) : null}
      </section>

      <section className={`rounded-3xl border p-4 ${flowStatus === "pending_payment" ? "animate-pulse border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
        <p className="text-sm font-black text-slate-900">Step 4. 예약금 결제 게이트웨이</p>
        <p className="mt-2 text-sm text-slate-700">기본 출장비 50,000원을 입금하시면 기사님이 배정됩니다.</p>
        <button
          type="button"
          onClick={() => void confirmPayment()}
          disabled={!reservationId || loading || flowStatus === "assigned_done"}
          className="mt-3 h-20 w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-xl font-black text-white disabled:opacity-50"
        >
          {flowStatus === "assigned_done" ? "배정 완료" : loading ? "결제 확인 중..." : "결제하기"}
        </button>

        <div className="mt-3 rounded-xl bg-white/80 p-3 text-sm font-bold text-slate-800">
          {flowStatus === "draft" && "접수 대기"}
          {flowStatus === "pending_payment" && "접수 대기 (결제 신호 대기)"}
          {flowStatus === "assigned_waiting" && "기사 배정 중"}
          {flowStatus === "assigned_done" && "배정 완료"}
        </div>
      </section>

      {message ? <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <LiveNotificationToast role="resident" phoneDigits={residentPhone} />
    </main>
  );
}
