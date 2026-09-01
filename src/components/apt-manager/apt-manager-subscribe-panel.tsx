"use client";

import { useCallback, useEffect, useState } from "react";
import { loadTossScript } from "@/lib/toss-sdk";

type SubscriptionState = {
  status: "inactive" | "active" | "past_due" | "cancelled";
  billingMethod: "toss_auto" | "bank_transfer" | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  lastPaymentAt: string | null;
  cancelledAt: string | null;
};

type QuotaState = {
  subscribed: boolean;
  usedThisCycle: number;
  remainingFree: number;
  cycleResetAt: string;
  freeQuotaPerCycle: number;
  promoActive: boolean;
  promoUntil: string;
};

type ApartmentState = { name: string; totalUnits: number | null; monthlyPrice: number };

type SubscriptionResponse = {
  subscription?: SubscriptionState;
  quota?: QuotaState;
  apartment?: ApartmentState;
  message?: string;
};

const STATUS_LABEL: Record<SubscriptionState["status"], string> = {
  inactive: "무료 이용중",
  active: "구독중",
  // 결제 실패 시 무제한 권한만 즉시 사라지고, 무료 5건/30일 한도로 되돌아간다(입력·발송은 계속 무료).
  past_due: "결제 실패 — 무료 한도로 전환",
  cancelled: "해지됨"
};

const STATUS_CLASS: Record<SubscriptionState["status"], string> = {
  inactive: "bg-slate-100 text-slate-600",
  active: "bg-dk-green/10 text-dk-green",
  past_due: "bg-dk-red/10 text-dk-red",
  cancelled: "bg-slate-100 text-slate-600"
};

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export default function AptManagerSubscribePanel() {
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [apartment, setApartment] = useState<ApartmentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/apt-manager/subscription", { cache: "no-store" });
      const data = (await response.json()) as SubscriptionResponse;
      if (!response.ok) {
        setMessage(data.message ?? "구독 정보를 불러오지 못했습니다.");
        return;
      }
      setSubscription(data.subscription ?? null);
      setQuota(data.quota ?? null);
      setApartment(data.apartment ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 카드 등록창에서 돌아온 결과 안내 — 콜백 라우트가 billing=success|error로 리다이렉트해준다.
  // useSearchParams 대신 window에서 직접 읽는다(그쪽은 Suspense 경계를 요구해 정적 빌드를 깨뜨림).
  useEffect(() => {
    const billing = new URLSearchParams(window.location.search).get("billing");
    if (billing === "success") setMessage("카드가 등록되었습니다. 이제 점검표 PDF를 제한 없이 받으실 수 있어요.");
    else if (billing === "error") setMessage("카드 등록에 실패했습니다. 다시 시도하시거나 대경이엔피로 연락해주세요.");
  }, []);

  const registerCard = async () => {
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "";
    if (!clientKey) {
      setMessage("결제 설정이 준비되지 않았습니다. 대경이엔피로 연락해주세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      // customerKey는 서버가 발급해 구독행에 저장해 둔 값을 그대로 쓴다 — 콜백에서 대조한다.
      const keyResponse = await fetch("/api/apt-manager/subscription", { method: "POST" });
      const keyData = (await keyResponse.json()) as { customerKey?: string; message?: string };
      if (!keyResponse.ok || !keyData.customerKey) {
        setMessage(keyData.message ?? "카드 등록 준비에 실패했습니다.");
        return;
      }

      await loadTossScript();
      const tossFactory = window.TossPayments;
      if (!tossFactory) throw new Error("결제 SDK를 불러오지 못했습니다.");
      const origin = window.location.origin;
      await tossFactory(clientKey).requestBillingAuth("카드", {
        customerKey: keyData.customerKey,
        successUrl: `${origin}/api/apt-manager/subscription/billing-auth-callback`,
        failUrl: `${origin}/apt-manager/subscribe?billing=error`
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "카드 등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm("구독을 해지할까요? 남은 기간까지는 그대로 이용하실 수 있어요.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/apt-manager/subscription/cancel", { method: "POST" });
      const data = (await response.json()) as { message?: string };
      setMessage(data.message ?? "해지 처리했습니다.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-500">불러오는 중...</p>;
  }

  const status = subscription?.status ?? "inactive";
  const remaining = quota?.remainingFree ?? 0;
  const perCycle = quota?.freeQuotaPerCycle ?? 5;
  const remainDays = daysLeft(subscription?.currentPeriodEnd ?? null);
  const promoActive = quota?.promoActive ?? false;

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-slate-700">{message}</p> : null}

      {promoActive ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800">
          🎉 2026년 말까지는 점검표 PDF 다운로드가 구독 여부와 상관없이 전면 무료입니다. 2027년부터 구독 단지만 다운로드할 수 있어요.
        </div>
      ) : null}

      <div className="rounded-2xl border border-dk-blue/20 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-slate-500">{apartment?.name || "우리 단지"}</p>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
        </div>

        {promoActive ? (
          <>
            <p className="mt-2 text-2xl font-black text-dk-navy">점검표 PDF 다운로드 무제한</p>
            <p className="mt-1 text-xs text-slate-500">
              프로모션 기간(2026년 말까지)에는 개별 · 일괄 zip 모두 제한 없이 받으실 수 있어요. 이 기간에 받은 점검건은
              2027년 이후에도 계속 무료로 다시 받으실 수 있습니다.
            </p>
          </>
        ) : status === "active" ? (
          <>
            <p className="mt-2 text-2xl font-black text-dk-navy">
              점검표 PDF 무제한
              {remainDays !== null ? <span className="ml-2 text-base font-bold text-dk-blue">D-{remainDays}</span> : null}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              이용 기간 만료 {formatDate(subscription?.currentPeriodEnd ?? null)}
              {subscription?.cancelledAt ? " · 해지 예약됨(기간 종료 후 무료 이용으로 전환)" : ""}
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-2xl font-black text-dk-navy">
              이번 주기 무료 {remaining}
              <span className="text-base font-bold text-slate-400"> / {perCycle}건 남음</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {formatDate(quota?.cycleResetAt ?? null)}에 무료 {perCycle}건이 다시 채워져요. 한 번 받은 점검건은 다시 받아도
              무료입니다.
            </p>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed text-slate-600 shadow-sm">
        <p className="text-sm font-bold text-dk-navy">계속 무료로 쓰실 수 있는 것</p>
        <p className="mt-1">세대 점검입력 · AI 안전진단 판정 · 세대 문자/카카오 결과 발송은 구독 여부와 상관없이 언제나 무료예요.</p>
        <p className="mt-3 text-sm font-bold text-dk-navy">{promoActive ? "2027년부터 달라지는 것" : "구독하면 달라지는 것"}</p>
        <p className="mt-1">
          {promoActive
            ? "2027년 1월 1일부터는 점검표 PDF 다운로드가 구독 단지만 가능해집니다. 지금 받아두신 PDF는 그 이후에도 계속 무료로 다시 받으실 수 있어요."
            : "점검표 PDF 다운로드가 무제한이 됩니다(개별 · 일괄 zip 모두)."}
        </p>
      </div>

      <div className="rounded-2xl border border-dk-blue/20 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-dk-navy">우리 단지 구독료{promoActive ? " (2027년부터 적용)" : ""}</p>
        <p className="mt-1 text-2xl font-black text-dk-blue">
          월 {(apartment?.monthlyPrice ?? 30000).toLocaleString("ko-KR")}원
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {apartment?.totalUnits ? `총 ${apartment.totalUnits}세대 기준` : "총세대수 미등록 — 300세대 이하 요금 적용중"} (300세대
          이하 30,000원 / 300세대 초과 50,000원)
        </p>
        {promoActive ? (
          <p className="mt-1 text-xs text-slate-400">지금 미리 등록해두시면 2027년부터 자동으로 적용돼요. 급하지 않으시면 연말 이후에 등록하셔도 됩니다.</p>
        ) : null}

        {status === "active" && subscription?.billingMethod === "toss_auto" ? (
          <button
            type="button"
            disabled={busy || Boolean(subscription?.cancelledAt)}
            onClick={() => void cancel()}
            className="mt-3 w-full rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50"
          >
            {subscription?.cancelledAt ? "해지 예약됨" : "구독 해지"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void registerCard()}
            className="mt-3 w-full rounded-xl bg-dk-blue py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "여는 중..." : "💳 카드 자동결제 등록"}
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed text-slate-600 shadow-sm">
        <p className="text-sm font-bold text-dk-navy">계좌이체로 결제하시려면</p>
        <p className="mt-1">
          대경이엔피(<a href="tel:010-8945-1111" className="font-semibold text-dk-blue">010-8945-1111</a>)로 연락 주시면 입금 계좌를
          안내해 드립니다. 입금 확인 후 바로 활성화해 드리고, 세금계산서도 이때 함께 발행해 드려요.
        </p>
        <p className="mt-2 text-xs text-slate-400">앱에서 직접 활성화하실 수는 없고, 입금 확인 후 대경이엔피가 처리합니다.</p>
      </div>
    </div>
  );
}
