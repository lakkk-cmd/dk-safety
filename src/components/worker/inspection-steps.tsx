"use client";

import { useCallback, useState } from "react";
import { StepProgress } from "@/components/ui/step-progress";
import { BigButton } from "@/components/ui/big-button";
import { downscaleImageFiles } from "@/lib/downscale-image";
import type { FieldReportInput } from "@/lib/field-reports";

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

const STEP_LABELS = ["분전반", "차단기", "콘센트/배선", "종합판정"];

export type InspectionInput = Omit<FieldReportInput, "reservationId" | "apartmentAddress" | "status">;

function BigToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
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

/**
 * 현장방문 순서 5번(점검) — 분전반/차단기/콘센트배선/종합판정 4단계 입력.
 * 제출 버튼은 부모(worker-task-detail)가 마지막 스텝에서 렌더링해 다음 단계(견적 산출) 진입을 관장한다.
 */
export default function InspectionSteps({
  onSubmit,
  submitting
}: {
  onSubmit: (input: InspectionInput) => void;
  submitting: boolean;
}) {
  const [step, setStep] = useState(0);

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
  const [message, setMessage] = useState<string | null>(null);

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

  const submit = () => {
    if (!stepValid(3)) {
      setMessage("위험등급을 선택해주세요.");
      return;
    }
    onSubmit({
      breakerTripCurrentMa: breakerTripCurrentMa === "" ? null : Number(breakerTripCurrentMa),
      mainBreakerCapacityA: mainBreakerCapacityA === "" ? null : Number(mainBreakerCapacityA),
      insulationResistanceMohm: insulationResistanceMohm === "" ? null : Number(insulationResistanceMohm),
      leakageDetected,
      leakagePathNote,
      breakerYear: breakerYear === "" ? null : Number(breakerYear),
      breakerVisualStatus: (breakerVisualStatus || null) as InspectionInput["breakerVisualStatus"],
      unitAreaSqm: unitAreaSqm === "" ? null : Number(unitAreaSqm),
      outletOverheat,
      outletOverheatNote,
      wiringDamage,
      wiringDamageNote,
      groundingStatus: (groundingStatus || null) as InspectionInput["groundingStatus"],
      riskLevel: (riskLevel || null) as InspectionInput["riskLevel"],
      urgentParts: urgentParts as InspectionInput["urgentParts"],
      siteMemo,
      photoUrls
    });
  };

  return (
    <div className="space-y-4">
      <StepProgress steps={STEP_LABELS} current={step} className="-mx-4" />

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
            <p className="mb-2 text-[15px] font-bold text-slate-800">문제부위 사진 (최대 3장)</p>
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
                    <img src={url} alt={`문제부위 ${idx + 1}`} className="h-20 w-full object-cover" />
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
        ) : (
          <BigButton variant="primary" icon="🤖" disabled={submitting} onClick={submit} className="flex-[2]">
            {submitting ? "처리 중..." : "점검 완료 · 진단 리포트 발송"}
          </BigButton>
        )}
      </div>
    </div>
  );
}
