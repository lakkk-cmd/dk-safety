"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Reservation } from "@/lib/reservations-store";

const BREAKER_VISUAL_STATUS_OPTIONS = ["정상", "과열흔적", "소손", "교체필요"] as const;
const GROUNDING_STATUS_OPTIONS = ["정상", "불량", "미확인"] as const;
const RISK_LEVEL_OPTIONS = ["안전", "주의", "경고", "위험"] as const;
const URGENT_PART_OPTIONS = ["차단기", "콘센트", "배선", "접지단자", "기타"] as const;
const BREAKER_CAPACITY_OPTIONS = [20, 30, 40, 50, 60, 75, 100] as const;

const RISK_LEVEL_CLASS: Record<string, string> = {
  안전: "border-emerald-500 bg-emerald-50 text-emerald-800",
  주의: "border-amber-400 bg-amber-50 text-amber-800",
  경고: "border-orange-500 bg-orange-50 text-orange-800",
  위험: "border-rose-600 bg-rose-50 text-rose-800"
};

type ReservationOption = { task: { id: string }; reservation: Reservation };

type SectionKey = "basic" | "panel" | "breaker" | "wiring" | "risk" | "photos";

const SECTION_TITLES: Record<SectionKey, string> = {
  basic: "기본 정보",
  panel: "분전반(두꺼비집) 계측값",
  breaker: "차단기 상태",
  wiring: "콘센트/배선 상태",
  risk: "종합 위험도",
  photos: "첨부 사진"
};

function WarnBadge({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-rose-600">⚠ {label}</span>;
}

export default function FieldReportForm() {
  const [reservations, setReservations] = useState<ReservationOption[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inspectedAt = useState(() => new Date())[0];

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    basic: true,
    panel: true,
    breaker: false,
    wiring: false,
    risk: false,
    photos: false
  });
  const sectionRefs = useRef<Partial<Record<SectionKey, HTMLDivElement | null>>>({});

  // 기본 정보
  const [reservationId, setReservationId] = useState("");
  const [apartmentAddress, setApartmentAddress] = useState("");

  // 분전반 계측값
  const [breakerTripCurrentMa, setBreakerTripCurrentMa] = useState("");
  const [mainBreakerCapacityA, setMainBreakerCapacityA] = useState("");
  const [insulationResistanceMohm, setInsulationResistanceMohm] = useState("");
  const [leakageDetected, setLeakageDetected] = useState(false);
  const [leakagePathNote, setLeakagePathNote] = useState("");

  // 차단기 상태
  const [breakerYear, setBreakerYear] = useState("");
  const [breakerVisualStatus, setBreakerVisualStatus] = useState("");

  // 콘센트/배선 상태
  const [unitAreaSqm, setUnitAreaSqm] = useState("");
  const [outletOverheat, setOutletOverheat] = useState(false);
  const [outletOverheatNote, setOutletOverheatNote] = useState("");
  const [wiringDamage, setWiringDamage] = useState(false);
  const [wiringDamageNote, setWiringDamageNote] = useState("");
  const [groundingStatus, setGroundingStatus] = useState("");

  // 종합 위험도
  const [riskLevel, setRiskLevel] = useState("");
  const [urgentParts, setUrgentParts] = useState<string[]>([]);
  const [siteMemo, setSiteMemo] = useState("");

  // 첨부 사진
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const forceOpenAndScroll = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: true }));
    requestAnimationFrame(() => {
      sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

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
      } catch {
        if (active) setMessage("네트워크 오류가 발생했습니다.");
      } finally {
        if (active) setLoadingReservations(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const onReservationChange = (id: string) => {
    setReservationId(id);
    const hit = reservations.find((row) => row.reservation.id === id);
    setApartmentAddress(hit ? hit.reservation.address : "");
  };

  const leakageAbnormal = breakerTripCurrentMa !== "" && Number(breakerTripCurrentMa) > 30;
  const insulationAbnormal = insulationResistanceMohm !== "" && Number(insulationResistanceMohm) < 1;

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
      const formData = new FormData();
      selected.forEach((file) => formData.append("photos", file));
      const response = await fetch("/api/worker/field-reports/photos", { method: "POST", body: formData });
      const data = (await response.json()) as { urls?: string[]; message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "사진 업로드에 실패했습니다.");
        return;
      }
      setPhotoUrls((prev) => [...prev, ...(data.urls ?? [])].slice(0, 3));
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setUploadingPhotos(false);
    }
  };

  const removePhoto = (url: string) => {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  };

  const validate = useCallback((): SectionKey | null => {
    if (!reservationId) return "basic";
    if (!apartmentAddress.trim()) return "basic";
    if (!breakerVisualStatus) return "breaker";
    if (!groundingStatus) return "wiring";
    if (!riskLevel) return "risk";
    return null;
  }, [reservationId, apartmentAddress, breakerVisualStatus, groundingStatus, riskLevel]);

  const submit = async () => {
    const invalidSection = validate();
    if (invalidSection) {
      setMessage(`${SECTION_TITLES[invalidSection]} 섹션의 필수 항목을 입력해주세요.`);
      forceOpenAndScroll(invalidSection);
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
      window.location.href = `/field-report/preview/${data.report.id}`;
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const sortedReservations = useMemo(
    () => [...reservations].sort((a, b) => a.reservation.preferredTime.localeCompare(b.reservation.preferredTime)),
    [reservations]
  );

  return (
    <div className="space-y-4">
      <Link href="/worker" className="inline-flex text-sm font-semibold text-blue-700">
        목록으로
      </Link>

      <div>
        <p className="warranty-badge">현장 점검 입력</p>
        <h1 className="mt-1 text-lg font-black text-slate-900">세대 점검 계측값 입력</h1>
      </div>

      {message ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p> : null}

      {/* 기본 정보 */}
      <Section
        title={SECTION_TITLES.basic}
        open={openSections.basic}
        onToggle={() => toggleSection("basic")}
        refCallback={(el) => (sectionRefs.current.basic = el)}
      >
        <Field label="예약 선택" required>
          <select
            className="soft-input w-full text-sm"
            value={reservationId}
            onChange={(e) => onReservationChange(e.target.value)}
            disabled={loadingReservations}
          >
            <option value="">{loadingReservations ? "불러오는 중..." : "당일 예약을 선택하세요"}</option>
            {sortedReservations.map((row) => (
              <option key={row.task.id} value={row.reservation.id}>
                {row.reservation.preferredTime} · {row.reservation.name} · {row.reservation.address}
              </option>
            ))}
          </select>
          {!loadingReservations && sortedReservations.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">오늘 날짜로 배정된 예약이 없습니다.</p>
          ) : null}
        </Field>
        <Field label="세대 주소" required>
          <input
            className="soft-input w-full text-sm"
            value={apartmentAddress}
            onChange={(e) => setApartmentAddress(e.target.value)}
            placeholder="예약 선택 시 자동입력"
          />
        </Field>
        <Field label="점검 일시">
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {inspectedAt.toLocaleString("ko-KR")}
          </p>
        </Field>
      </Section>

      {/* 분전반 계측값 */}
      <Section
        title={SECTION_TITLES.panel}
        open={openSections.panel}
        onToggle={() => toggleSection("panel")}
        refCallback={(el) => (sectionRefs.current.panel = el)}
      >
        <Field label="누전차단기 동작 전류 (mA)">
          <input
            type="number"
            inputMode="decimal"
            className={`soft-input w-full text-sm ${leakageAbnormal ? "border-rose-500 ring-2 ring-rose-200" : ""}`}
            value={breakerTripCurrentMa}
            onChange={(e) => setBreakerTripCurrentMa(e.target.value)}
            placeholder="정상범위: 30mA 이하"
          />
          <WarnBadge show={leakageAbnormal} label="정상범위(30mA 이하) 초과" />
        </Field>
        <Field label="주 차단기 용량 (A)">
          <select className="soft-input w-full text-sm" value={mainBreakerCapacityA} onChange={(e) => setMainBreakerCapacityA(e.target.value)}>
            <option value="">선택</option>
            {BREAKER_CAPACITY_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}A
              </option>
            ))}
          </select>
        </Field>
        <Field label="절연저항값 (MΩ)">
          <input
            type="number"
            inputMode="decimal"
            className={`soft-input w-full text-sm ${insulationAbnormal ? "border-rose-500 ring-2 ring-rose-200" : ""}`}
            value={insulationResistanceMohm}
            onChange={(e) => setInsulationResistanceMohm(e.target.value)}
            placeholder="정상범위: 1MΩ 이상"
          />
          <WarnBadge show={insulationAbnormal} label="정상범위(1MΩ 이상) 미달" />
        </Field>
        <ToggleField label="누전 발생 여부" value={leakageDetected} onChange={setLeakageDetected} />
        {leakageDetected ? (
          <Field label="누전 추정 경로">
            <input
              className="soft-input w-full text-sm"
              value={leakagePathNote}
              onChange={(e) => setLeakagePathNote(e.target.value)}
              placeholder="예: 안방 콘센트 3번"
            />
          </Field>
        ) : null}
      </Section>

      {/* 차단기 상태 */}
      <Section
        title={SECTION_TITLES.breaker}
        open={openSections.breaker}
        onToggle={() => toggleSection("breaker")}
        refCallback={(el) => (sectionRefs.current.breaker = el)}
      >
        <Field label="차단기 제조연도">
          <input
            type="number"
            inputMode="numeric"
            className="soft-input w-full text-sm"
            value={breakerYear}
            onChange={(e) => setBreakerYear(e.target.value)}
            placeholder="예: 2015"
          />
        </Field>
        <Field label="차단기 육안 상태" required>
          <ButtonGroup options={BREAKER_VISUAL_STATUS_OPTIONS} value={breakerVisualStatus} onChange={setBreakerVisualStatus} />
        </Field>
      </Section>

      {/* 콘센트/배선 상태 */}
      <Section
        title={SECTION_TITLES.wiring}
        open={openSections.wiring}
        onToggle={() => toggleSection("wiring")}
        refCallback={(el) => (sectionRefs.current.wiring = el)}
      >
        <Field label="점검 세대 전용면적 (㎡)">
          <input
            type="number"
            inputMode="decimal"
            className="soft-input w-full text-sm"
            value={unitAreaSqm}
            onChange={(e) => setUnitAreaSqm(e.target.value)}
          />
        </Field>
        <ToggleField label="콘센트 과열 여부" value={outletOverheat} onChange={setOutletOverheat} />
        {outletOverheat ? (
          <Field label="과열 위치 메모">
            <input className="soft-input w-full text-sm" value={outletOverheatNote} onChange={(e) => setOutletOverheatNote(e.target.value)} />
          </Field>
        ) : null}
        <ToggleField label="배선 노출/손상 여부" value={wiringDamage} onChange={setWiringDamage} />
        {wiringDamage ? (
          <Field label="손상 위치 메모">
            <input className="soft-input w-full text-sm" value={wiringDamageNote} onChange={(e) => setWiringDamageNote(e.target.value)} />
          </Field>
        ) : null}
        <Field label="접지 연결 상태" required>
          <ButtonGroup options={GROUNDING_STATUS_OPTIONS} value={groundingStatus} onChange={setGroundingStatus} />
        </Field>
      </Section>

      {/* 종합 위험도 */}
      <Section
        title={SECTION_TITLES.risk}
        open={openSections.risk}
        onToggle={() => toggleSection("risk")}
        refCallback={(el) => (sectionRefs.current.risk = el)}
      >
        <Field label="위험등급" required>
          <div className="grid grid-cols-4 gap-2">
            {RISK_LEVEL_OPTIONS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setRiskLevel(level)}
                className={`rounded-xl border-2 py-2 text-sm font-bold transition ${
                  riskLevel === level ? RISK_LEVEL_CLASS[level] : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </Field>
        <Field label="긴급 교체 필요 부품">
          <div className="flex flex-wrap gap-2">
            {URGENT_PART_OPTIONS.map((part) => (
              <button
                key={part}
                type="button"
                onClick={() => toggleUrgentPart(part)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  urgentParts.includes(part) ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {part}
              </button>
            ))}
          </div>
        </Field>
        <Field label="현장 메모">
          <textarea
            className="soft-input w-full text-sm"
            rows={4}
            value={siteMemo}
            onChange={(e) => setSiteMemo(e.target.value)}
            placeholder="기타 특이사항을 기록하세요"
          />
        </Field>
      </Section>

      {/* 첨부 사진 */}
      <Section
        title={SECTION_TITLES.photos}
        open={openSections.photos}
        onToggle={() => toggleSection("photos")}
        refCallback={(el) => (sectionRefs.current.photos = el)}
      >
        <p className="text-xs text-slate-500">분전반 사진 최대 3장</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          disabled={uploadingPhotos || photoUrls.length >= 3}
          className="mt-2 block w-full text-xs"
          onChange={(e) => void uploadPhotos(e.target.files)}
        />
        {photoUrls.length > 0 ? (
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {photoUrls.map((url, idx) => (
              <li key={`${url}-${idx}`} className="relative overflow-hidden rounded-lg border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`분전반 ${idx + 1}`} className="h-20 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(url)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs font-bold text-white"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="w-full rounded-xl bg-gradient-to-r from-dk-navy to-dk-blue py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy ? "저장 중..." : "점검 기록 저장"}
      </button>
    </div>
  );
}

function Section({
  title,
  open,
  onToggle,
  refCallback,
  children
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  refCallback: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div ref={refCallback} className="overflow-hidden rounded-2xl border border-[#d6deec] bg-white shadow-[0_12px_24px_rgba(11,28,58,0.08)]">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-black text-slate-900">{title}</span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? <div className="space-y-3 border-t border-slate-100 px-4 py-4">{children}</div> : null}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-800">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </p>
      {children}
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-xl border-2 py-2 text-sm font-bold ${
            value ? "border-rose-500 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          YES
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-xl border-2 py-2 text-sm font-bold ${
            !value ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          NO
        </button>
      </div>
    </Field>
  );
}

function ButtonGroup({ options, value, onChange }: { options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            value === option ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
