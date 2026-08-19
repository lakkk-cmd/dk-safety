"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { calculate_final_fee, patentServiceTypeLabel, type ServiceItem } from "@/lib/daekyung-fee-logic";
import type { WarrantyView } from "@/lib/warranty-pg";

type Props = {
  warranty: WarrantyView;
};

type ServiceKey = "VISIT" | "DIAGNOSIS" | "LEAKAGE" | "OUTLET" | "LIGHT";

const SERVICE_PRESETS: Record<ServiceKey, ServiceItem> = {
  VISIT: {
    id: "visit",
    service_type: "VISIT",
    name: "기본 출장비",
    min_fee: 50000,
    max_fee: 50000,
    surcharge_flag: false,
    bulk_discount_flag: false,
    bulk_threshold: 5,
    bulk_discount_rate: 0,
    deductible_flag: true,
    negotiation_flag: false
  },
  DIAGNOSIS: {
    id: "diagnosis",
    service_type: "DIAGNOSIS",
    name: "정밀 안전진단",
    min_fee: 150000,
    max_fee: 150000,
    surcharge_flag: false,
    bulk_discount_flag: false,
    bulk_threshold: 5,
    bulk_discount_rate: 0,
    deductible_flag: false,
    negotiation_flag: false
  },
  LEAKAGE: {
    id: "leakage",
    service_type: "LEAKAGE",
    name: "누전 점검/보수",
    min_fee: 300000,
    max_fee: 999999,
    surcharge_flag: true,
    bulk_discount_flag: false,
    bulk_threshold: 5,
    bulk_discount_rate: 0,
    deductible_flag: false,
    negotiation_flag: false
  },
  OUTLET: {
    id: "outlet",
    service_type: "OUTLET",
    name: "콘센트/스위치",
    min_fee: 15000,
    max_fee: 25000,
    unit_price: 15000,
    surcharge_flag: false,
    bulk_discount_flag: true,
    bulk_threshold: 5,
    bulk_discount_rate: 10,
    deductible_flag: false,
    negotiation_flag: false
  },
  LIGHT: {
    id: "light",
    service_type: "LIGHT",
    name: "전등기구 교체",
    min_fee: 30000,
    max_fee: 50000,
    surcharge_flag: false,
    bulk_discount_flag: false,
    bulk_threshold: 5,
    bulk_discount_rate: 0,
    deductible_flag: false,
    negotiation_flag: true
  }
};

const currency = (value: number) => `${Math.max(0, Math.round(value)).toLocaleString()}원`;

function toServiceKey(value: string | null | undefined): ServiceKey {
  const normalized = value?.trim().toUpperCase();
  return normalized && normalized in SERVICE_PRESETS ? (normalized as ServiceKey) : "VISIT";
}

export default function DigitalWarrantyArtifact({ warranty }: Props) {
  const [tab, setTab] = useState<"cert" | "calc" | "verify">("cert");
  const [viewer, setViewer] = useState<null | "pdf" | "image">(null);
  const [baseFee, setBaseFee] = useState(warranty.finalAmount ?? 50000);
  const [extraFee, setExtraFee] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [serviceType, setServiceType] = useState<ServiceKey>(() => toServiceKey(warranty.serviceType));
  const [workProceeded, setWorkProceeded] = useState(false);
  const [verifyInput, setVerifyInput] = useState(warranty.warrantyNumber);
  const [verifyState, setVerifyState] = useState<{ loading: boolean; error?: string; found?: WarrantyView }>({ loading: false });

  const [asOpen, setAsOpen] = useState(false);
  const [asDetail, setAsDetail] = useState("");
  const [asDate, setAsDate] = useState("");
  const [asTime, setAsTime] = useState("");
  const [asSubmitting, setAsSubmitting] = useState(false);
  const [asError, setAsError] = useState<string | null>(null);
  const [asResult, setAsResult] = useState<string | null>(null);

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);

  const submitAsRequest = async () => {
    setAsError(null);
    if (asDetail.trim().length < 2) {
      setAsError("증상/요청 내용을 2자 이상 입력해주세요.");
      return;
    }
    if (!asDate || !asTime) {
      setAsError("방문 희망 날짜와 시간을 선택해주세요.");
      return;
    }
    setAsSubmitting(true);
    try {
      const response = await fetch(`/api/warranties/${encodeURIComponent(warranty.warrantyNumber)}/as-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detail: asDetail.trim(), preferredDate: asDate, preferredTime: asTime })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setAsError(data.message ?? "A/S 신청에 실패했습니다.");
        return;
      }
      setAsResult(data.message ?? "A/S 요청이 접수되었습니다.");
    } catch {
      setAsError("A/S 신청 중 오류가 발생했습니다.");
    } finally {
      setAsSubmitting(false);
    }
  };

  const calcResult = useMemo(
    () =>
      calculate_final_fee({
        base_fee: baseFee,
        extra_fee: extraFee,
        service_item: SERVICE_PRESETS[serviceType],
        quantity,
        work_proceeded: workProceeded
      }),
    [baseFee, extraFee, quantity, serviceType, workProceeded]
  );

  const onVerify = async () => {
    const number = verifyInput.trim().toUpperCase();
    if (!number) return;
    setVerifyState({ loading: true });
    try {
      const response = await fetch(`/api/warranties/${encodeURIComponent(number)}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setVerifyState({ loading: false, error: payload.message ?? "보증서를 찾을 수 없습니다." });
        return;
      }
      const payload = (await response.json()) as { warranty?: WarrantyView };
      if (!payload.warranty) {
        setVerifyState({ loading: false, error: "보증서를 찾을 수 없습니다." });
        return;
      }
      setVerifyState({ loading: false, found: payload.warranty });
    } catch {
      setVerifyState({ loading: false, error: "진위 확인 중 오류가 발생했습니다." });
    }
  };

  const isIssued = warranty.status === "ISSUED";
  const imageUrl = `/api/warranties/${encodeURIComponent(warranty.warrantyNumber)}/image`;
  const pdfUrl = `/api/warranties/${encodeURIComponent(warranty.warrantyNumber)}/pdf`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">
        <button type="button" onClick={() => setTab("cert")} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === "cert" ? "bg-white text-slate-900" : "text-slate-500"}`}>보증서</button>
        <button type="button" onClick={() => setTab("calc")} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === "calc" ? "bg-white text-slate-900" : "text-slate-500"}`}>정산 계산기</button>
        <button type="button" onClick={() => setTab("verify")} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === "verify" ? "bg-white text-slate-900" : "text-slate-500"}`}>진위 확인</button>
      </div>

      {tab === "cert" ? (
        <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <p className="text-xs text-slate-300">보증 번호</p>
            <p className="mt-1 font-mono text-lg font-semibold text-amber-300">{warranty.warrantyNumber}</p>
            <p className={`mt-2 text-sm font-bold ${isIssued ? "text-emerald-300" : "text-rose-300"}`}>{isIssued ? "보증 유효" : "보증 상태 확인 필요"}</p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">단지</p><p className="font-semibold text-slate-900">{warranty.apartmentName} ({warranty.apartmentCode})</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">서비스</p><p className="font-semibold text-slate-900">{patentServiceTypeLabel(warranty.serviceType)}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">담당 기사</p><p className="font-semibold text-slate-900">{warranty.technicianName ?? "미지정"}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">최종 정산금</p><p className="font-semibold text-slate-900">{currency(warranty.finalAmount ?? 0)}</p></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setViewer("pdf")} className="btn-primary inline-flex items-center justify-center px-4 py-3 text-sm">보증서 PDF 열기</button>
            <button type="button" onClick={() => setViewer("image")} className="btn-outline inline-flex items-center justify-center px-4 py-3 text-sm">보증서 이미지 열기</button>
          </div>

          {isIssued ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              {asResult ? (
                <p className="text-sm font-bold text-emerald-700">✅ {asResult}</p>
              ) : asOpen ? (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-amber-900">A/S 신청 (보증기간 내 재방문)</p>
                  <textarea
                    value={asDetail}
                    onChange={(e) => setAsDetail(e.target.value.slice(0, 500))}
                    placeholder="증상/요청 내용을 적어주세요 (2자 이상)"
                    rows={3}
                    className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={asDate}
                      min={todayStr}
                      onChange={(e) => setAsDate(e.target.value)}
                      className="h-11 rounded-xl border border-slate-300 px-3 text-sm"
                    />
                    <input
                      type="time"
                      value={asTime}
                      onChange={(e) => setAsTime(e.target.value)}
                      className="h-11 rounded-xl border border-slate-300 px-3 text-sm"
                    />
                  </div>
                  {asError ? <p className="text-xs font-semibold text-rose-600">{asError}</p> : null}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAsOpen(false)} className="btn-outline flex-1 px-4 py-2 text-sm">
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitAsRequest()}
                      disabled={asSubmitting}
                      className="btn-primary flex-1 px-4 py-2 text-sm disabled:opacity-50"
                    >
                      {asSubmitting ? "접수 중..." : "A/S 신청하기"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setAsOpen(true)}
                    className="w-full rounded-xl border-2 border-amber-400 bg-white px-4 py-3 text-sm font-bold text-amber-900"
                  >
                    🔧 A/S 신청 (보증기간 내 재방문)
                  </button>
                  <p className="mt-2 text-xs text-amber-800">출장비 무료로 자동 접수됩니다. 단, A/S 방문건에는 새 보증서가 발급되지 않으며, 현장에서 추가 작업비가 발생할 수 있습니다.</p>
                </>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "calc" ? (
        <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">기본 출장비<input type="number" value={baseFee} onChange={(e) => setBaseFee(Number(e.target.value || 0))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
            <label className="text-sm font-semibold text-slate-700">현장 추가 비용<input type="number" value={extraFee} onChange={(e) => setExtraFee(Number(e.target.value || 0))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
            <label className="text-sm font-semibold text-slate-700">수량<input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value || 1)))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
            <label className="text-sm font-semibold text-slate-700">서비스 유형<select value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceKey)} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3"><option value="VISIT">기본 출장비</option><option value="DIAGNOSIS">정밀 안전진단</option><option value="LEAKAGE">누전 점검/보수</option><option value="OUTLET">콘센트/스위치</option><option value="LIGHT">전등기구 교체</option></select></label>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={workProceeded} onChange={(e) => setWorkProceeded(e.target.checked)} />출장비 공제 적용 (본 작업 진행)</label>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p>소계: <strong>{currency(calcResult.subtotal)}</strong></p>
            <p>출장비 기결제분(추가 결제 시 차감): <strong>{currency(calcResult.deductible_amount)}</strong></p>
            <p>묶음 할인: <strong>{currency(calcResult.bulk_discount_amount)}</strong></p>
            <p className="mt-1 text-base">최종 정산 총액: <strong className="text-blue-700">{currency(calcResult.total_fee)}</strong></p>
            <p className="text-sm">이번에 추가로 결제할 금액: <strong className="text-emerald-700">{currency(calcResult.amount_due_now)}</strong></p>
            {calcResult.validation.requires_confirmation ? <p className="mt-2 text-xs text-amber-700">확인 요청 필요 상태입니다.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "verify" ? (
        <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">다른 보증번호를 입력해 진위를 확인할 수 있습니다. (기본값: 현재 보고 있는 보증서 번호)</p>
          <div className="flex gap-2">
            <input value={verifyInput} onChange={(e) => setVerifyInput(e.target.value)} className="h-11 flex-1 rounded-xl border border-slate-300 px-3 font-mono text-sm" placeholder="WST-2024-APT001-3A8F2" />
            <button type="button" onClick={() => void onVerify()} className="btn-primary px-4 text-sm" disabled={verifyState.loading}>{verifyState.loading ? "확인중" : "진위 확인"}</button>
          </div>
          {verifyState.error ? <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{verifyState.error}</p> : null}
          {verifyState.found ? (
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-bold">유효한 보증서입니다.</p>
              <p className="mt-1">단지: {verifyState.found.apartmentName} ({verifyState.found.apartmentCode})</p>
              <p>서비스: {verifyState.found.serviceType ?? "미지정"}</p>
              <p>정산금액: {currency(verifyState.found.finalAmount ?? 0)}</p>
              <Link href={`/verify/${encodeURIComponent(verifyState.found.warrantyNumber)}`} className="mt-2 inline-flex text-sm font-bold underline">보증서 페이지 열기</Link>
            </div>
          ) : null}
        </section>
      ) : null}

      {viewer ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3">
            <button
              type="button"
              onClick={() => setViewer(null)}
              className="flex items-center gap-1 text-sm font-bold text-white"
            >
              ← 돌아가기
            </button>
            <a
              href={viewer === "pdf" ? pdfUrl : imageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-slate-300 underline"
            >
              새 탭에서 열기
            </a>
          </div>
          <div className="flex-1 overflow-auto bg-slate-950">
            {viewer === "pdf" ? (
              <iframe src={pdfUrl} title="보증서 PDF" className="h-full w-full border-0" />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="보증서 이미지" className="max-h-full max-w-full object-contain" />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
