"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Reservation } from "@/lib/reservations-store";
import { StepProgress } from "@/components/ui/step-progress";
import { BigButton } from "@/components/ui/big-button";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingOverlay, type LoadingOverlayStep } from "@/components/ui/loading-overlay";
import { EmptyState } from "@/components/ui/empty-state";
import { downscaleImageFiles } from "@/lib/downscale-image";

const BREAKER_VISUAL_STATUS_OPTIONS = ["정상", "과열흔적", "소손", "교체필요"] as const;
const GROUNDING_STATUS_OPTIONS = ["정상", "불량", "미확인"] as const;
const RISK_LEVEL_OPTIONS = ["안전", "주의", "경고", "위험"] as const;
const URGENT_PART_OPTIONS = ["차단기", "콘센트", "배선", "접지단자", "기타"] as const;
const BREAKER_CAPACITY_OPTIONS = [20, 30, 40, 50, 60] as const;

const RISK_LEVEL_CLASS: Record<string, string> = {
  안전: "border-dk-green bg-dk-green text-white",
  주의: "border-dk-gold bg-dk-gold text-white",
  경고: "border-dk-amber bg-dk-amber text-white",
  위험: "border-dk-red bg-dk-red text-white"
};

const RISK_LEVEL_ICON: Record<string, string> = { 안전: "🟢", 주의: "🟡", 경고: "🟠", 위험: "🔴" };

type ReservationOption = { task: { id: string }; reservation: Reservation };

const STEP_LABELS = ["분전반", "차단기", "콘센트/배선", "종합판정"];

function BigToggle({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[15px] font-bold text-slate-800">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`min-h-14 rounded-2xl border-2 text-base font-bold transition ${
            !value ? "border-dk-green bg-dk-green text-white" : "border-slate-200 bg-white text-slate-500"
          }`}
        >
          🟢 없음
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`min-h-14 rounded-2xl border-2 text-base font-bold transition ${
            value ? "border-dk-red bg-dk-red text-white" : "border-slate-200 bg-white text-slate-500"
          }`}
        >
          🔴 있음
        </button>
      </div>
    </div>
  );
}

function BigOptionGroup({
  label,
  options,
  value,
  onChange,
  columns = 2
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  columns?: number;
}) {
  return (
    <div>
      <p className="mb-2 text-[15px] font-bold text-slate-800">{label}</p>
      <div className={`grid gap-2 ${columns === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`min-h-12 rounded-2xl border-2 text-[15px] font-bold transition ${
              value === option ? "border-dk-blue bg-dk-sky text-dk-navy" : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FieldReportWizard({ presetReservationId }: { presetReservationId?: string }) {
  const router = useRouter();
  const [reservations, setReservations] = useState<ReservationOption[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reservationId, setReservationId] = useState(presetReservationId ?? "");
  const [apartmentAddress, setApartmentAddress] = useState("");
  const [step, setStep] = useState(presetReservationId ? 0 : -1); // -1 = 예약 선택 화면

  const [breakerTripCurrentMa, setBreakerTripCurrentMa] = useState("");
  const [mainBreakerCapacityA, setMainBreakerCapacityA] = useState("");
  const [insulationResistanceMohm, setInsulationResistanceMohm] = useState("");
  const [leakageDetected, setLeakageDetected] = useState(false);
  const [leakagePathNote, setLeakagePathNote] = useState("");

  const [breakerYear, setBreakerYear] = useState("");
  const [breakerVisualStatus, setBreakerVisualStatus] = useState("");

  const [unitAreaSqm, setUnitAreaSqm] = useState("");
  const [outletOverheat, setOutletOverheat] = useState(false);
  const [outletOverheatNote, setOutletOverheatNote] = useState("");
  const [wiringDamage, setWiringDamage] = useState(false);
  const [wiringDamageNote, setWiringDamageNote] = useState("");
  const [groundingStatus, setGroundingStatus] = useState("");

  const [riskLevel, setRiskLevel] = useState("");
  const [urgentParts, setUrgentParts] = useState<string[]>([]);
  const [siteMemo, setSiteMemo] = useState("");

  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [pipelineSteps, setPipelineSteps] = useState<LoadingOverlayStep[] | null>(null);
  const [pdfUrls, setPdfUrls] = useState<{ landlord: string | null; resident: string | null }>({ landlord: null, resident: null });
  const [done, setDone] = useState(false);
  const [savedFieldReportId, setSavedFieldReportId] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/worker/field-reports/reservations", { cache: "no-store" });
        const data = (await response.json()) as { items?: ReservationOption[]; message?: string };
        if (!active) return;
        if (!response.ok) {
          setMessage(data.message ?? "당일 예약 목록을 불러오지 못했습니다.");
          return;
        }
        setReservations(data.items ?? []);
        if (presetReservationId) {
          const hit = data.items?.find((row) => row.reservation.id === presetReservationId);
          if (hit) {
            setApartmentAddress(hit.reservation.address);
          } else {
            setMessage("오늘 예약 목록에서 해당 작업을 찾지 못해 직접 선택이 필요합니다.");
            setStep(-1);
          }
        }
      } catch {
        if (active) setMessage("네트워크 오류가 발생했습니다.");
      } finally {
        if (active) setLoadingReservations(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [presetReservationId]);

  const selectedReservation = useMemo(
    () => reservations.find((row) => row.reservation.id === reservationId)?.reservation ?? null,
    [reservations, reservationId]
  );

  const sortedReservations = useMemo(
    () => [...reservations].sort((a, b) => a.reservation.preferredTime.localeCompare(b.reservation.preferredTime)),
    [reservations]
  );

  const onPickReservation = (id: string) => {
    setReservationId(id);
    const hit = reservations.find((row) => row.reservation.id === id);
    setApartmentAddress(hit ? hit.reservation.address : "");
    setStep(0);
  };

  const leakageAbnormal = breakerTripCurrentMa !== "" && Number(breakerTripCurrentMa) > 30;
  const insulationAbnormal = insulationResistanceMohm !== "" && Number(insulationResistanceMohm) < 1;
  const needsReplacement = breakerVisualStatus === "소손" || breakerVisualStatus === "교체필요";

  const toggleUrgentPart = (part: string) => {
    setUrgentParts((prev) => (prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]));
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPhotos(true);
    setMessage(null);
    try {
      const remaining = Math.max(0, 3 - photoUrls.length);
      const selected = Array.from(files).slice(0, remaining);
      if (selected.length === 0) {
        setMessage("사진은 최대 3장까지 첨부할 수 있습니다.");
        return;
      }
      const downscaled = await downscaleImageFiles(selected);
      const formData = new FormData();
      downscaled.forEach((file) => formData.append("photos", file));
      const response = await fetch("/api/worker/field-reports/photos", { method: "POST", body: formData });
      const data = (await response.json()) as { urls?: string[]; message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "사진 업로드에 실패했습니다.");
        return;
      }
      setPhotoUrls((prev) => [...prev, ...(data.urls ?? [])].slice(0, 3));
    } finally {
      setUploadingPhotos(false);
    }
  };

  const stepValid = useCallback(
    (idx: number): boolean => {
      if (idx === 1) return Boolean(breakerVisualStatus);
      if (idx === 2) return Boolean(groundingStatus);
      if (idx === 3) return Boolean(riskLevel);
      return true;
    },
    [breakerVisualStatus, groundingStatus, riskLevel]
  );

  const goNext = () => {
    if (!stepValid(step)) {
      setMessage("필수 항목을 선택해주세요.");
      return;
    }
    setMessage(null);
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  };

  const runPipeline = useCallback(
    async (fieldReportId: string) => {
      setPipelineError(false);
      const steps: LoadingOverlayStep[] = [
        { label: "AI 소견 생성 중...", status: "running" },
        { label: "PDF 리포트 생성 중...", status: "pending" },
        { label: "카카오 알림톡 발송 중...", status: "pending" }
      ];
      setPipelineSteps([...steps]);

      const fail = (idx: number, fallbackMessage: string, data: { message?: string }) => {
        steps[idx] = { ...steps[idx], status: "error" };
        setPipelineSteps([...steps]);
        setMessage(data.message ?? fallbackMessage);
        setPipelineError(true);
        window.setTimeout(() => setPipelineSteps(null), 1200);
      };

      try {
        const opinionRes = await fetch("/api/field-report/generate-opinion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldReportId })
        });
        if (!opinionRes.ok) {
          fail(0, "AI 소견 생성에 실패했습니다.", await opinionRes.json().catch(() => ({})));
          return;
        }
        steps[0] = { ...steps[0], status: "done" };
        steps[1] = { ...steps[1], status: "running" };
        setPipelineSteps([...steps]);

        const pdfRes = await fetch("/api/field-report/generate-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldReportId })
        });
        const pdfData = (await pdfRes.json().catch(() => ({}))) as {
          pdfLandlordUrl?: string;
          pdfResidentUrl?: string;
          message?: string;
        };
        if (!pdfRes.ok) {
          fail(1, "PDF 생성에 실패했습니다.", pdfData);
          return;
        }
        setPdfUrls({ landlord: pdfData.pdfLandlordUrl ?? null, resident: pdfData.pdfResidentUrl ?? null });
        steps[1] = { ...steps[1], status: "done" };
        steps[2] = { ...steps[2], status: "running" };
        setPipelineSteps([...steps]);

        const sendRes = await fetch("/api/field-report/send-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldReportId })
        });
        const sendData = (await sendRes.json().catch(() => ({}))) as { message?: string };
        if (!sendRes.ok) {
          fail(2, "알림톡 발송에 실패했습니다.", sendData);
          return;
        }
        steps[2] = { ...steps[2], status: "done" };
        setPipelineSteps([...steps]);
        setDone(true);
      } catch {
        steps.forEach((s, i) => {
          if (s.status === "running") steps[i] = { ...s, status: "error" };
        });
        setPipelineSteps([...steps]);
        setMessage("네트워크 오류로 파이프라인이 중단되었습니다.");
        setPipelineError(true);
        window.setTimeout(() => setPipelineSteps(null), 1200);
      }
    },
    []
  );

  const submitAndSend = async () => {
    if (!stepValid(3)) {
      setMessage("위험등급을 선택해주세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/worker/field-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId,
          apartmentAddress,
          breakerTripCurrentMa: breakerTripCurrentMa === "" ? null : Number(breakerTripCurrentMa),
          mainBreakerCapacityA: mainBreakerCapacityA === "" ? null : Number(mainBreakerCapacityA),
          insulationResistanceMohm: insulationResistanceMohm === "" ? null : Number(insulationResistanceMohm),
          leakageDetected,
          leakagePathNote,
          breakerYear: breakerYear === "" ? null : Number(breakerYear),
          breakerVisualStatus,
          unitAreaSqm: unitAreaSqm === "" ? null : Number(unitAreaSqm),
          outletOverheat,
          outletOverheatNote,
          wiringDamage,
          wiringDamageNote,
          groundingStatus,
          riskLevel,
          urgentParts,
          siteMemo,
          photoUrls,
          status: "submitted"
        })
      });
      const data = (await response.json()) as { report?: { id: string }; message?: string };
      if (!response.ok || !data.report) {
        setMessage(data.message ?? "저장에 실패했습니다.");
        return;
      }
      setSavedFieldReportId(data.report.id);
      await runPipeline(data.report.id);
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-5xl">✅</p>
        <h1 className="text-2xl font-bold text-dk-navy">발송 완료!</h1>
        <p className="text-[15px] text-slate-500">진단 리포트가 생성되어 카카오 알림톡으로 발송되었습니다.</p>
        <div className="flex gap-2">
          {pdfUrls.resident ? (
            <a
              href={pdfUrls.resident}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-2xl border-2 border-dk-navy bg-white py-3 text-sm font-bold text-dk-navy"
            >
              거주자용 PDF
            </a>
          ) : null}
          {pdfUrls.landlord ? (
            <a
              href={pdfUrls.landlord}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-2xl border-2 border-dk-navy bg-white py-3 text-sm font-bold text-dk-navy"
            >
              임대인용 PDF
            </a>
          ) : null}
        </div>
        <BigButton variant="primary" icon="➡️" onClick={() => router.push("/worker")}>
          다음 작업으로
        </BigButton>
      </div>
    );
  }

  if (step === -1) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xl font-bold text-dk-navy">어떤 점검을 시작할까요?</p>
          <p className="mt-1 text-[15px] text-slate-500">오늘 배정된 예약 중 하나를 선택하세요.</p>
        </div>
        {message ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p> : null}
        {loadingReservations ? (
          <p className="text-sm text-slate-500">불러오는 중...</p>
        ) : sortedReservations.length === 0 ? (
          <EmptyState icon="📭" title="오늘 예약이 없어요" description="배정된 예약이 있어야 점검을 시작할 수 있습니다." />
        ) : (
          <ul className="space-y-2">
            {sortedReservations.map((row) => (
              <li key={row.task.id}>
                <button
                  type="button"
                  onClick={() => onPickReservation(row.reservation.id)}
                  className="w-full rounded-2xl bg-white p-4 text-left shadow-[0_4px_16px_rgba(11,31,58,0.08)]"
                >
                  <p className="text-lg font-bold text-dk-navy">{row.reservation.preferredTime}</p>
                  <p className="mt-0.5 text-[15px] font-semibold text-slate-700">{row.reservation.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{row.reservation.address}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <StepProgress steps={STEP_LABELS} current={step} className="-mx-4" />

      <SectionCard icon="📍" title={selectedReservation?.name ?? "세대 점검"}>
        <p className="text-sm text-slate-500">{apartmentAddress}</p>
      </SectionCard>

      {message ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p> : null}

      {step === 0 ? (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[15px] font-bold text-slate-800">누전차단기 동작 전류 (mA)</p>
            <input
              type="range"
              min={0}
              max={100}
              value={breakerTripCurrentMa === "" ? 0 : Number(breakerTripCurrentMa)}
              onChange={(e) => setBreakerTripCurrentMa(e.target.value)}
              className="w-full accent-dk-blue"
            />
            <input
              type="number"
              inputMode="decimal"
              value={breakerTripCurrentMa}
              onChange={(e) => setBreakerTripCurrentMa(e.target.value)}
              placeholder="정상범위: 30mA 이하"
              className={`soft-input mt-2 w-full text-base ${leakageAbnormal ? "border-dk-red ring-2 ring-dk-red/20" : ""}`}
            />
            {leakageAbnormal ? <p className="mt-1 text-sm font-bold text-dk-red">⚠️ 정상범위(30mA 이하) 초과</p> : null}
          </div>

          <div>
            <p className="mb-2 text-[15px] font-bold text-slate-800">절연저항값 (MΩ)</p>
            <input
              type="number"
              inputMode="decimal"
              value={insulationResistanceMohm}
              onChange={(e) => setInsulationResistanceMohm(e.target.value)}
              placeholder="정상범위: 1MΩ 이상"
              className={`soft-input w-full text-base ${insulationAbnormal ? "border-dk-red ring-2 ring-dk-red/20" : ""}`}
            />
            {insulationAbnormal ? <p className="mt-1 text-sm font-bold text-dk-red">⚠️ 정상범위(1MΩ 이상) 미달</p> : null}
          </div>

          <BigOptionGroup
            label="주 차단기 용량"
            options={BREAKER_CAPACITY_OPTIONS.map((a) => `${a}A`)}
            value={mainBreakerCapacityA ? `${mainBreakerCapacityA}A` : ""}
            onChange={(v) => setMainBreakerCapacityA(v.replace("A", ""))}
            columns={3}
          />

          <BigToggle label="누전 발생 여부" value={leakageDetected} onChange={setLeakageDetected} />
          {leakageDetected ? (
            <input
              className="soft-input w-full text-base"
              value={leakagePathNote}
              onChange={(e) => setLeakagePathNote(e.target.value)}
              placeholder="누전 추정 경로 (예: 안방 콘센트 3번)"
            />
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[15px] font-bold text-slate-800">차단기 제조연도</p>
            <input
              type="number"
              inputMode="numeric"
              value={breakerYear}
              onChange={(e) => setBreakerYear(e.target.value)}
              placeholder="예: 2015"
              className="soft-input w-full text-base"
            />
          </div>
          <BigOptionGroup label="차단기 육안 상태 *" options={BREAKER_VISUAL_STATUS_OPTIONS} value={breakerVisualStatus} onChange={setBreakerVisualStatus} />
          {needsReplacement ? <p className="text-sm font-bold text-dk-red">🔴 교체가 필요한 상태입니다 — 긴급 교체 부품에 자동 반영하세요.</p> : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[15px] font-bold text-slate-800">점검 세대 전용면적 (㎡)</p>
            <input
              type="number"
              inputMode="decimal"
              value={unitAreaSqm}
              onChange={(e) => setUnitAreaSqm(e.target.value)}
              className="soft-input w-full text-base"
            />
          </div>
          <BigToggle label="콘센트 과열 여부" value={outletOverheat} onChange={setOutletOverheat} />
          {outletOverheat ? (
            <input
              className="soft-input w-full text-base"
              value={outletOverheatNote}
              onChange={(e) => setOutletOverheatNote(e.target.value)}
              placeholder="과열 위치 메모"
            />
          ) : null}
          <BigToggle label="배선 노출/손상 여부" value={wiringDamage} onChange={setWiringDamage} />
          {wiringDamage ? (
            <input
              className="soft-input w-full text-base"
              value={wiringDamageNote}
              onChange={(e) => setWiringDamageNote(e.target.value)}
              placeholder="손상 위치 메모"
            />
          ) : null}
          <BigOptionGroup label="접지 연결 상태 *" options={GROUNDING_STATUS_OPTIONS} value={groundingStatus} onChange={setGroundingStatus} columns={3} />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[15px] font-bold text-slate-800">위험등급 *</p>
            <div className="grid grid-cols-2 gap-2">
              {RISK_LEVEL_OPTIONS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setRiskLevel(level)}
                  className={`min-h-14 rounded-2xl border-2 text-base font-bold transition ${
                    riskLevel === level ? RISK_LEVEL_CLASS[level] : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  {RISK_LEVEL_ICON[level]} {level}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[15px] font-bold text-slate-800">긴급 교체 필요 부품</p>
            <div className="flex flex-wrap gap-2">
              {URGENT_PART_OPTIONS.map((part) => (
                <button
                  key={part}
                  type="button"
                  onClick={() => toggleUrgentPart(part)}
                  className={`rounded-full border-2 px-4 py-2 text-sm font-bold ${
                    urgentParts.includes(part) ? "border-dk-blue bg-dk-sky text-dk-navy" : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  {part}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[15px] font-bold text-slate-800">현장 사진 (최대 3장)</p>
            <label className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-dk-blue bg-dk-sky text-[15px] font-bold text-dk-navy">
              📷 카메라로 촬영
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={uploadingPhotos || photoUrls.length >= 3}
                className="hidden"
                onChange={(e) => void uploadPhotos(e.target.files)}
              />
            </label>
            {photoUrls.length > 0 ? (
              <ul className="mt-2 grid grid-cols-3 gap-2">
                {photoUrls.map((url, idx) => (
                  <li key={`${url}-${idx}`} className="overflow-hidden rounded-xl border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`현장 ${idx + 1}`} className="h-20 w-full object-cover" />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-[15px] font-bold text-slate-800">메모</p>
            <textarea
              className="soft-input w-full text-base"
              rows={3}
              value={siteMemo}
              onChange={(e) => setSiteMemo(e.target.value)}
              placeholder="기타 특이사항 (선택)"
            />
          </div>
        </div>
      ) : null}

      <div className="flex gap-2 pt-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="min-h-14 flex-1 rounded-2xl border-2 border-slate-200 text-base font-bold text-slate-600"
          >
            이전
          </button>
        ) : null}
        {step < STEP_LABELS.length - 1 ? (
          <BigButton variant="primary" onClick={goNext} className="flex-[2]">
            다음
          </BigButton>
        ) : pipelineError && savedFieldReportId ? (
          <BigButton variant="danger" icon="🔁" disabled={busy} onClick={() => void runPipeline(savedFieldReportId)} className="flex-[2]">
            재시도
          </BigButton>
        ) : (
          <BigButton variant="primary" icon="🤖" disabled={busy} onClick={() => void submitAndSend()} className="flex-[2]">
            {busy ? "처리 중..." : "AI 리포트 자동 생성 및 발송"}
          </BigButton>
        )}
      </div>

      {pipelineSteps ? <LoadingOverlay title="진단 리포트 생성 중" steps={pipelineSteps} /> : null}
    </div>
  );
}
