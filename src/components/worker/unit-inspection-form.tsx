"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BigButton } from "@/components/ui/big-button";
import { SectionCard } from "@/components/ui/section-card";
import { StepProgress } from "@/components/ui/step-progress";
import { EmptyState } from "@/components/ui/empty-state";
import SignaturePad from "@/components/worker/signature-pad";
import PrivacyConsentCheckbox from "@/components/privacy-consent-checkbox";
import {
  CHECKLIST_ITEMS,
  MANUAL_CHECK_ITEM_IDS,
  SIMPLE_INSPECTION_ITEM_IDS,
  type ChecklistItemId,
  type ChecklistResult
} from "@/lib/unit-inspection-rules";

type InspectionType = "visit" | "unvisited_simple";

type ApartmentOption = {
  id: string;
  name: string;
  electrical_safety_manager_name: string | null;
};

type DiagnosisEntry = {
  item: string;
  verdict: string;
  regulation: string;
  actionTypes: string[];
  comment: string;
};

type CompanyAdvisoryEntry = { item: string; comment: string };

const RESULT_OPTIONS: { value: ChecklistResult; label: string; activeClass: string }[] = [
  { value: "O", label: "○ 적합", activeClass: "border-dk-green bg-dk-green text-white" },
  { value: "X", label: "× 부적합", activeClass: "border-dk-red bg-dk-red text-white" },
  { value: "/", label: "/ 해당없음", activeClass: "border-slate-400 bg-slate-500 text-white" }
];

const SIMPLE_INSPECTABLE_SET = new Set<ChecklistItemId>(SIMPLE_INSPECTION_ITEM_IDS);
const MANUAL_CHECK_SET = new Set<ChecklistItemId>(MANUAL_CHECK_ITEM_IDS);

function groupByCategory() {
  const groups: { category: string; ids: ChecklistItemId[] }[] = [];
  for (const def of CHECKLIST_ITEMS) {
    const last = groups[groups.length - 1];
    if (last && last.category === def.category) {
      last.ids.push(def.id);
    } else {
      groups.push({ category: def.category, ids: [def.id] });
    }
  }
  return groups;
}
const CATEGORY_GROUPS = groupByCategory();

type UnitInspectionFormProps = {
  /** 단지 목록 조회 API — 기본은 워커용. 전기과장 화면은 세션에 단지가 이미 고정돼 있어 안 씀. */
  apartmentsEndpoint?: string;
  /** 점검 저장 API — 기본은 워커용. */
  submitEndpoint?: string;
  /** 지정하면 단지선택 UI를 숨기고 이 단지로 고정한다(전기과장용 — 세션에 단지가 이미 고정돼 있음). */
  lockedApartment?: { id: string; name: string } | null;
  /** "목록으로" 버튼이 이동할 경로. */
  backHref?: string;
  backLabel?: string;
};

export default function UnitInspectionForm({
  apartmentsEndpoint = "/api/worker/apartments",
  submitEndpoint = "/api/worker/unit-inspections",
  lockedApartment = null,
  backHref = "/worker",
  backLabel = "목록으로"
}: UnitInspectionFormProps = {}) {
  const [apartments, setApartments] = useState<ApartmentOption[]>([]);
  const [loadingApartments, setLoadingApartments] = useState(!lockedApartment);

  const [apartmentId, setApartmentId] = useState(lockedApartment?.id ?? "");
  const [apartmentQuery, setApartmentQuery] = useState(lockedApartment?.name ?? "");
  const [apartmentDropdownOpen, setApartmentDropdownOpen] = useState(false);
  const [dong, setDong] = useState("");
  const [ho, setHo] = useState("");
  const [inspectionType, setInspectionType] = useState<InspectionType>("visit");

  // 초기값 null = "아직 안 눌렀음". "/"(해당없음)는 워커가 실제로 그 버튼을 눌렀을 때만 들어간다 —
  // 그래야 "미입력"과 "해당없음으로 확인함"이 구분된다.
  const [results, setResults] = useState<Record<ChecklistItemId, ChecklistResult | null>>(
    () => Object.fromEntries(CHECKLIST_ITEMS.map((d) => [d.id, null])) as Record<ChecklistItemId, ChecklistResult | null>
  );
  const [notes, setNotes] = useState<Record<ChecklistItemId, string>>(
    () => Object.fromEntries(CHECKLIST_ITEMS.map((d) => [d.id, ""])) as Record<ChecklistItemId, string>
  );

  const [loadCurrent, setLoadCurrent] = useState("");
  const [igr, setIgr] = useState("");
  const [insulationResistance, setInsulationResistance] = useState("");
  const [circuitBreakerCount, setCircuitBreakerCount] = useState("");
  const [outletInstallYear, setOutletInstallYear] = useState("");
  const [switchInstallYear, setSwitchInstallYear] = useState("");
  const [etcNotes, setEtcNotes] = useState("");

  const [residentName, setResidentName] = useState("");
  const [residentPhone, setResidentPhone] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [privacyConsent, setPrivacyConsent] = useState(false);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ── 세대미방문 간이점검 전용 "연속입력 모드" ──────────────────────────────────
  // 현장(EPS실)에서 종이 점검표처럼 동 하나 고정해두고 호만 계속 바꿔가며 빠르게 넘어가는
  // 방식으로 바꿔달라는 실제 현장 피드백(2026-09-07)에 따라 신설. 동/차단기 회로수는 동 단위로
  // 한 번만 입력해 고정하고, "다음"을 누르는 즉시 그 세대를 백그라운드로 저장한 뒤 화면은
  // 바로 다음 호 입력으로 넘어간다(응답을 기다리지 않음 — 체감 속도가 종이 점검표 수준이 되도록).
  // "전송" 버튼 개념은 없앴다 — 세대별로 이미 저장이 끝났으므로, 그 버튼은 실제로는 아무것도
  // 새로 보내지 않고 그냥 동 재설정 화면으로 돌아가는 네비게이션 역할만 한다.
  const [fastLoopStarted, setFastLoopStarted] = useState(false);
  const [editingCircuitCount, setEditingCircuitCount] = useState(false);
  const [fastHo, setFastHo] = useState("");
  const [fastManualResults, setFastManualResults] = useState<Record<string, ChecklistResult | null>>({});
  const [fastLoadCurrent, setFastLoadCurrent] = useState("");
  const [fastIgr, setFastIgr] = useState("");
  const [fastInsulationResistance, setFastInsulationResistance] = useState("");
  type FastLogEntry = {
    id: string;
    ho: string;
    status: "saving" | "done" | "error";
    errorMessage?: string;
    payload: {
      ho: string;
      circuitBreakerCount: number;
      manualResults: Record<string, ChecklistResult | null>;
      loadCurrent: string;
      igr: string;
      insulationResistance: string;
    };
  };
  const [fastLog, setFastLog] = useState<FastLogEntry[]>([]);
  const [result, setResult] = useState<{
    diagnosis: DiagnosisEntry[];
    advisories: CompanyAdvisoryEntry[];
    apartmentName: string;
    notificationSent: boolean | null;
  } | null>(null);

  useEffect(() => {
    if (lockedApartment) return;
    (async () => {
      try {
        const response = await fetch(apartmentsEndpoint, { cache: "no-store" });
        const data = (await response.json()) as { apartments?: ApartmentOption[]; message?: string };
        if (response.ok) setApartments(data.apartments ?? []);
      } finally {
        setLoadingApartments(false);
      }
    })();
  }, [apartmentsEndpoint, lockedApartment]);

  const stepLabels = useMemo(
    () => (inspectionType === "visit" ? ["기본정보", "점검항목", "실측값", "서명"] : ["기본정보", "점검항목", "실측값"]),
    [inspectionType]
  );
  const isLastStep = step === stepLabels.length - 1;

  const filteredApartments = useMemo(() => {
    const q = apartmentQuery.trim().toLowerCase();
    if (!q) return apartments;
    return apartments.filter((a) => a.name.toLowerCase().includes(q));
  }, [apartments, apartmentQuery]);

  const selectApartment = (apt: ApartmentOption) => {
    setApartmentId(apt.id);
    setApartmentQuery(apt.name);
    setApartmentDropdownOpen(false);
  };

  const visibleGroups = useMemo(
    () =>
      CATEGORY_GROUPS.map((g) => ({
        category: g.category,
        ids: inspectionType === "visit" ? g.ids : g.ids.filter((id) => SIMPLE_INSPECTABLE_SET.has(id))
      })).filter((g) => g.ids.length > 0),
    [inspectionType]
  );

  const requiredManualIdsForType = useMemo(
    () => CHECKLIST_ITEMS.filter((d) => MANUAL_CHECK_SET.has(d.id) && (inspectionType === "visit" || SIMPLE_INSPECTABLE_SET.has(d.id))).map((d) => d.id),
    [inspectionType]
  );
  const uncheckedManualIds = requiredManualIdsForType.filter((id) => results[id] === null);

  // 실측값 단계는 두 유형 모두 index 2(방문점검은 서명 단계가 하나 더 있어 마지막이 아니고,
  // 미방문 간이점검은 여기가 마지막 단계) — 차단기 회로수는 절연저항/누설전류 자동판정 임계값
  // 계산에 반드시 필요해 두 유형 모두 필수로 강제한다(2026-08-28, 단지별 수동 기준값 폐지).
  const circuitBreakerCountValid = circuitBreakerCount.trim() !== "" && Number(circuitBreakerCount) >= 1;

  const stepValid = (idx: number): boolean => {
    if (idx === 0) {
      if (inspectionType === "unvisited_simple") return Boolean(apartmentId && dong.trim() && circuitBreakerCountValid);
      return Boolean(apartmentId && dong.trim() && ho.trim());
    }
    if (idx === 1) return uncheckedManualIds.length === 0;
    if (idx === 2) return circuitBreakerCountValid;
    if (idx === stepLabels.length - 1 && inspectionType === "visit") {
      return Boolean(
        residentName.trim() && signatureData && /^01[0-9]-?\d{3,4}-?\d{4}$/.test(residentPhone.trim()) && privacyConsent
      );
    }
    return true;
  };

  const validationMessageFor = (idx: number): string => {
    if (idx === 0) {
      return inspectionType === "unvisited_simple"
        ? "단지·동·분전함 차단기 회로수를 모두 입력해주세요(회로수는 1 이상)."
        : "단지·동·호를 모두 입력해주세요.";
    }
    if (idx === 1) return `현장에서 직접 확인해야 하는 항목이 ${uncheckedManualIds.length}개 남았어요. ○/×/  중 하나를 눌러주세요.`;
    if (idx === 2) return "분전함 차단기 회로수를 입력해주세요(1 이상).";
    if (!privacyConsent) return "세대주 개인정보 수집·이용 동의를 받아주세요.";
    return "세대 성명·연락처·서명을 모두 입력해주세요.";
  };

  // 검증 실패 문구가 화면 상단에 뜨는데, 실측값 단계처럼 아래쪽 입력칸을 채우다 바로 제출
  // 버튼을 누르면 스크롤이 안 올라가 있어 문구를 못 보고 지나칠 수 있다(2026-08-28 지적) —
  // 문구를 띄우면서 항상 맨 위로 스크롤해 바로 눈에 들어오게 한다.
  const showMessage = (msg: string) => {
    setMessage(msg);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goNext = () => {
    if (!stepValid(step)) {
      showMessage(validationMessageFor(step));
      return;
    }
    setMessage(null);
    if (inspectionType === "unvisited_simple" && step === 0) {
      setFastLoopStarted(true);
      resetFastUnitFields();
      return;
    }
    setStep((s) => Math.min(s + 1, stepLabels.length - 1));
  };

  const resetFastUnitFields = () => {
    setFastHo("");
    setFastManualResults(Object.fromEntries(requiredManualIdsForType.map((id) => [id, null])));
    setFastLoadCurrent("");
    setFastIgr("");
    setFastInsulationResistance("");
  };

  const submitFastUnit = async (payload: FastLogEntry["payload"]) => {
    const logId = `${payload.ho}-${Date.now()}`;
    setFastLog((log) => [{ id: logId, ho: payload.ho, status: "saving", payload }, ...log]);

    const checklistResults = requiredManualIdsForType.map((id) => ({
      id,
      result: payload.manualResults[id] ?? "/",
      note: ""
    }));

    try {
      const response = await fetch(submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartmentId,
          dong,
          ho: payload.ho,
          inspectionType: "unvisited_simple",
          checklistResults,
          loadCurrent: payload.loadCurrent === "" ? null : Number(payload.loadCurrent),
          igr: payload.igr === "" ? null : Number(payload.igr),
          insulationResistance: payload.insulationResistance === "" ? null : Number(payload.insulationResistance),
          circuitBreakerCount: payload.circuitBreakerCount,
          outletInstallYear: null,
          switchInstallYear: null,
          etcNotes: "",
          residentName: null,
          residentPhone: null,
          signatureData: null
        })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setFastLog((log) =>
          log.map((e) => (e.id === logId ? { ...e, status: "error", errorMessage: data.message ?? "저장 실패" } : e))
        );
        return;
      }
      setFastLog((log) => log.map((e) => (e.id === logId ? { ...e, status: "done" } : e)));
    } catch {
      setFastLog((log) => log.map((e) => (e.id === logId ? { ...e, status: "error", errorMessage: "네트워크 오류" } : e)));
    }
  };

  const uncheckedFastManualIds = requiredManualIdsForType.filter((id) => fastManualResults[id] == null);

  const handleFastNext = () => {
    if (!fastHo.trim()) {
      showMessage("호를 입력해주세요.");
      return;
    }
    if (uncheckedFastManualIds.length > 0) {
      showMessage("계량기 인입선 확인 결과를 눌러주세요.");
      return;
    }
    setMessage(null);
    void submitFastUnit({
      ho: fastHo.trim(),
      circuitBreakerCount: Number(circuitBreakerCount),
      manualResults: fastManualResults,
      loadCurrent: fastLoadCurrent,
      igr: fastIgr,
      insulationResistance: fastInsulationResistance
    });
    resetFastUnitFields();
    requestAnimationFrame(() => document.getElementById("fast-ho-input")?.focus());
  };

  const retryFastEntry = (entry: FastLogEntry) => {
    setFastLog((log) => log.filter((e) => e.id !== entry.id));
    void submitFastUnit(entry.payload);
  };

  const changeDong = () => {
    setFastLoopStarted(false);
    setDong("");
    resetFastUnitFields();
  };

  const submit = async () => {
    if (!stepValid(step)) {
      showMessage(validationMessageFor(step));
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      // 절연 2항목(requiresManualCheck: false)은 서버가 절연저항 실측값으로 자동판정하므로
      // 보낼 필요가 없다 — 수동확인이 필요한 항목만 담는다(우린 이미 stepValid로 전부 채워졌음을 확인함).
      const checklistResults = requiredManualIdsForType.map((id) => ({ id, result: results[id]!, note: notes[id] }));

      const response = await fetch(submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartmentId,
          dong,
          ho,
          inspectionType,
          checklistResults,
          loadCurrent: loadCurrent === "" ? null : Number(loadCurrent),
          igr: igr === "" ? null : Number(igr),
          insulationResistance: insulationResistance === "" ? null : Number(insulationResistance),
          circuitBreakerCount: circuitBreakerCount === "" ? null : Number(circuitBreakerCount),
          outletInstallYear: outletInstallYear === "" ? null : Number(outletInstallYear),
          switchInstallYear: switchInstallYear === "" ? null : Number(switchInstallYear),
          etcNotes,
          residentName: inspectionType === "visit" ? residentName : null,
          residentPhone: inspectionType === "visit" ? residentPhone : null,
          signatureData: inspectionType === "visit" ? signatureData : null
        })
      });
      const data = (await response.json()) as {
        inspection?: { autoDiagnosis?: DiagnosisEntry[]; companyAdvisories?: CompanyAdvisoryEntry[] };
        notification?: { success?: boolean };
        message?: string;
      };
      if (!response.ok) {
        showMessage(data.message ?? "저장에 실패했습니다.");
        return;
      }
      const apartmentName = lockedApartment?.name ?? apartments.find((a) => a.id === apartmentId)?.name ?? "";
      setResult({
        diagnosis: data.inspection?.autoDiagnosis ?? [],
        advisories: data.inspection?.companyAdvisories ?? [],
        apartmentName,
        notificationSent: inspectionType === "visit" ? Boolean(data.notification?.success) : null
      });
    } catch {
      showMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForNext = () => {
    setResult(null);
    setStep(0);
    setDong("");
    setHo("");
    setResults(Object.fromEntries(CHECKLIST_ITEMS.map((d) => [d.id, null])) as Record<ChecklistItemId, ChecklistResult | null>);
    setNotes(Object.fromEntries(CHECKLIST_ITEMS.map((d) => [d.id, ""])) as Record<ChecklistItemId, string>);
    setLoadCurrent("");
    setIgr("");
    setInsulationResistance("");
    setCircuitBreakerCount("");
    setOutletInstallYear("");
    setSwitchInstallYear("");
    setEtcNotes("");
    setResidentName("");
    setResidentPhone("");
    setSignatureData(null);
  };

  if (result) {
    return (
      <div className="space-y-4">
        <SectionCard icon="✅" title={`${result.apartmentName} ${dong}동 ${ho}호 점검 저장 완료`}>
          {result.notificationSent === true ? (
            <p className="mb-3 rounded-xl bg-dk-green/10 px-3 py-2 text-sm font-semibold text-dk-green">
              📱 세대에 결과 문자를 발송했어요.
            </p>
          ) : result.notificationSent === false ? (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
              ⚠️ 점검은 저장됐지만 세대 문자 발송에는 실패했어요 — 관리자에게 알려주세요.
            </p>
          ) : null}
          {result.diagnosis.length === 0 ? (
            <p className="text-[15px] text-slate-600">부적합 항목이 발견되지 않았습니다.</p>
          ) : (
            <ul className="space-y-3">
              {result.diagnosis.map((entry, idx) => (
                <li key={idx} className="rounded-xl border border-dk-red/30 bg-dk-red/5 p-3">
                  <p className="text-sm font-bold text-dk-red">{entry.verdict} · {entry.item}</p>
                  <p className="mt-1 text-[13px] text-slate-600">{entry.regulation}</p>
                  <p className="mt-1 text-[13px] text-slate-700">{entry.comment}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        {result.advisories.length > 0 ? (
          <SectionCard icon="🔧" title="우리집 전기주치의 자체 권장사항">
            <p className="mb-2 text-[12px] text-amber-700">※ 직무고시·별표3 등 법적 근거가 아닌 자체 점검 기준이에요.</p>
            <ul className="space-y-2">
              {result.advisories.map((entry, idx) => (
                <li key={idx} className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm font-bold text-amber-800">{entry.item}</p>
                  <p className="mt-1 text-[13px] text-amber-700">{entry.comment}</p>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
        <div className="flex gap-2">
          <BigButton variant="secondary" onClick={resetForNext} className="flex-1">
            다음 세대 점검
          </BigButton>
          <Link href={backHref} className="flex-1">
            <BigButton variant="primary" className="w-full">
              {backLabel}
            </BigButton>
          </Link>
        </div>
      </div>
    );
  }

  if (fastLoopStarted) {
    const fastStepValid = fastHo.trim() !== "" && uncheckedFastManualIds.length === 0;
    return (
      <div className="space-y-4">
        <SectionCard title={`${dong}동 연속입력`}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 px-3 py-2">
              <button type="button" onClick={changeDong} className="text-[13px] font-bold text-dk-blue underline underline-offset-2">
                동 변경
              </button>
              <span className="text-slate-300">·</span>
              {editingCircuitCount ? (
                <>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={circuitBreakerCount}
                    onChange={(e) => setCircuitBreakerCount(e.target.value)}
                    className="soft-input w-20 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingCircuitCount(false)}
                    className="text-[13px] font-bold text-dk-blue"
                  >
                    확인
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingCircuitCount(true)}
                  className="text-[13px] font-bold text-dk-blue underline underline-offset-2"
                >
                  회로수 {circuitBreakerCount}개 변경
                </button>
              )}
            </div>

            <div>
              <p className="mb-2 text-[15px] font-bold text-slate-800">호 *</p>
              <input
                id="fast-ho-input"
                autoFocus
                inputMode="numeric"
                value={fastHo}
                onChange={(e) => setFastHo(e.target.value)}
                placeholder="예: 502"
                className="soft-input w-full text-lg"
              />
            </div>

            {requiredManualIdsForType.map((id) => {
              const def = CHECKLIST_ITEMS.find((d) => d.id === id)!;
              return (
                <div key={id}>
                  <p className="mb-2 text-[14px] font-semibold text-slate-800">
                    {def.label} <span className="text-dk-red">*</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {RESULT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFastManualResults((prev) => ({ ...prev, [id]: opt.value }))}
                        className={`min-h-11 rounded-xl border-2 text-[13px] font-bold transition ${
                          fastManualResults[id] === opt.value ? opt.activeClass : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="mb-2 text-[15px] font-bold text-slate-800">부하전류 (A)</p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={fastLoadCurrent}
                  onChange={(e) => setFastLoadCurrent(e.target.value)}
                  className="soft-input w-full text-base"
                />
              </div>
              <div>
                <p className="mb-2 text-[15px] font-bold text-slate-800">IGR · 누설전류 (mA)</p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={fastIgr}
                  onChange={(e) => setFastIgr(e.target.value)}
                  className="soft-input w-full text-base"
                />
              </div>
              <div>
                <p className="mb-2 text-[15px] font-bold text-slate-800">절연저항 (MΩ)</p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={fastInsulationResistance}
                  onChange={(e) => setFastInsulationResistance(e.target.value)}
                  placeholder="예: 0.15"
                  className="soft-input w-full text-base"
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {message ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p> : null}

        <BigButton variant="primary" disabled={!fastStepValid} onClick={handleFastNext} className="w-full">
          다음 (저장하고 계속)
        </BigButton>

        {fastLog.length > 0 ? (
          <SectionCard title={`저장 현황 (${fastLog.filter((e) => e.status === "done").length}건 완료)`}>
            <ul className="space-y-1.5">
              {fastLog.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-slate-700">{dong}동 {entry.ho}호</span>
                  {entry.status === "saving" ? (
                    <span className="text-slate-400">저장 중...</span>
                  ) : entry.status === "done" ? (
                    <span className="font-bold text-dk-green">저장완료 ✓</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-dk-red">저장실패</span>
                      <button
                        type="button"
                        onClick={() => retryFastEntry(entry)}
                        className="rounded-lg border border-dk-red px-2 py-0.5 text-[12px] font-bold text-dk-red"
                      >
                        재시도
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}

        <Link href={backHref} className="block">
          <button type="button" className="min-h-14 w-full rounded-2xl border-2 border-slate-200 text-base font-bold text-slate-600">
            {backLabel}
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StepProgress steps={stepLabels} current={step} className="-mx-4" />

      {message ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p> : null}

      {step === 0 ? (
        <SectionCard title="기본정보">
          <div className="space-y-4">
            <div className="relative">
              <p className="mb-2 text-[15px] font-bold text-slate-800">단지 *</p>
              {lockedApartment ? (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] font-bold text-dk-navy">
                  {lockedApartment.name}
                </p>
              ) : loadingApartments ? (
                <p className="text-sm text-slate-500">불러오는 중...</p>
              ) : apartments.length === 0 ? (
                <EmptyState icon="🏢" title="등록된 단지가 없어요" description="관리자에게 단지 등록을 요청해주세요." />
              ) : (
                <>
                  <input
                    value={apartmentQuery}
                    onChange={(e) => {
                      setApartmentQuery(e.target.value);
                      setApartmentId("");
                      setApartmentDropdownOpen(true);
                    }}
                    onFocus={() => setApartmentDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setApartmentDropdownOpen(false), 150)}
                    placeholder="단지명을 검색하세요"
                    className="soft-input w-full text-base"
                  />
                  {apartmentDropdownOpen ? (
                    <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                      {filteredApartments.length === 0 ? (
                        <li className="px-4 py-3 text-sm text-slate-400">검색 결과가 없어요.</li>
                      ) : (
                        filteredApartments.map((apt) => (
                          <li key={apt.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectApartment(apt)}
                              className={`block w-full px-4 py-3 text-left text-[15px] ${
                                apt.id === apartmentId ? "bg-dk-sky font-bold text-dk-navy" : "hover:bg-slate-50"
                              }`}
                            >
                              {apt.name}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-2 text-[15px] font-bold text-slate-800">동 *</p>
                <input
                  inputMode="numeric"
                  value={dong}
                  onChange={(e) => setDong(e.target.value)}
                  placeholder="예: 101"
                  className="soft-input w-full text-base"
                />
              </div>
              {inspectionType === "unvisited_simple" ? (
                <div>
                  <p className="mb-2 text-[15px] font-bold text-slate-800">분전함 차단기 회로수 *</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={circuitBreakerCount}
                    onChange={(e) => setCircuitBreakerCount(e.target.value)}
                    placeholder="예: 8"
                    className="soft-input w-full text-base"
                  />
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-[15px] font-bold text-slate-800">호 *</p>
                  <input
                    inputMode="numeric"
                    value={ho}
                    onChange={(e) => setHo(e.target.value)}
                    placeholder="예: 502"
                    className="soft-input w-full text-base"
                  />
                </div>
              )}
            </div>
            {inspectionType === "unvisited_simple" ? (
              <p className="-mt-2 rounded-xl bg-dk-sky px-3 py-2 text-[12px] text-dk-navy">
                이 동에서는 같은 회로수를 계속 쓴다고 가정하고, 다음 화면부터는 호만 눌러가며 바로바로
                점검할 수 있어요. 회로수가 다른 세대를 만나면 다음 화면에서 바로 고쳐 넣을 수 있습니다.
              </p>
            ) : null}

            <div>
              <p className="mb-2 text-[15px] font-bold text-slate-800">점검 유형 *</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInspectionType("visit")}
                  className={`min-h-14 rounded-2xl border-2 text-[15px] font-bold transition ${
                    inspectionType === "visit" ? "border-dk-blue bg-dk-sky text-dk-navy" : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  세대방문점검
                </button>
                <button
                  type="button"
                  onClick={() => setInspectionType("unvisited_simple")}
                  className={`min-h-14 rounded-2xl border-2 text-[15px] font-bold transition ${
                    inspectionType === "unvisited_simple"
                      ? "border-dk-blue bg-dk-sky text-dk-navy"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  세대미방문 간이점검
                  <span className="block text-[11px] font-medium">(EPS실 외부점검)</span>
                </button>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          {inspectionType === "unvisited_simple" ? (
            <p className="rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-slate-600">
              미방문 간이점검은 절연(누전) 2항목 + 계량기 인입선 1항목만 실측합니다. 나머지 9항목은 서식에 자동으로
              &quot;해당없음&quot; 처리됩니다.
            </p>
          ) : null}
          {visibleGroups.map((group) => (
            <SectionCard key={group.category} title={group.category}>
              <div className="space-y-4">
                {group.ids.map((id) => {
                  const def = CHECKLIST_ITEMS.find((d) => d.id === id)!;
                  if (!def.requiresManualCheck) {
                    const isLeakageItem = id === "elb_missing_or_faulty";
                    const measurementLabel = isLeakageItem ? "누설전류(IGR)" : "절연저항";
                    return (
                      <div key={id}>
                        <p className="mb-1 text-[14px] font-semibold text-slate-800">{def.label}</p>
                        <p className="rounded-xl bg-dk-sky px-3 py-2 text-[13px] text-dk-navy">
                          ⚡ 다음 단계에서 입력할 {measurementLabel}·차단기 회로수를 기준으로 자동 판정됩니다 — 여기서 누를 필요
                          없어요.
                          {isLeakageItem ? " 단, \"미설치\"는 실측만으로 잡히지 않으니 육안으로 함께 확인해주세요." : ""}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div key={id}>
                      <p className="mb-2 text-[14px] font-semibold text-slate-800">
                        {def.label} <span className="text-dk-red">*</span>
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {RESULT_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setResults((prev) => ({ ...prev, [id]: opt.value }))}
                            className={`min-h-11 rounded-xl border-2 text-[13px] font-bold transition ${
                              results[id] === opt.value ? opt.activeClass : "border-slate-200 bg-white text-slate-500"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {results[id] === "X" ? (
                        <input
                          value={notes[id]}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [id]: e.target.value }))}
                          placeholder="비고 (예: 제조연월 확인, 손상 위치 등)"
                          className="soft-input mt-2 w-full text-sm"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <SectionCard title="실측값">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[15px] font-bold text-slate-800">부하전류 (A)</p>
              <input
                type="number"
                inputMode="decimal"
                value={loadCurrent}
                onChange={(e) => setLoadCurrent(e.target.value)}
                className="soft-input w-full text-base"
              />
            </div>
            <div>
              <p className="mb-2 text-[15px] font-bold text-slate-800">
                분전함 차단기 회로수 <span className="text-dk-red">*</span>
              </p>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={circuitBreakerCount}
                onChange={(e) => setCircuitBreakerCount(e.target.value)}
                placeholder="예: 8"
                className="soft-input w-full text-base"
              />
              <p className="mt-1 text-[12px] text-slate-500">
                절연저항·누설전류 자동판정 기준을 이 회로수로 계산합니다(절연저항 0.22MΩ÷회로수, 누설전류 1mA×회로수).
              </p>
            </div>
            <div>
              <p className="mb-2 text-[15px] font-bold text-slate-800">IGR · 누설전류 (mA)</p>
              <input
                type="number"
                inputMode="decimal"
                value={igr}
                onChange={(e) => setIgr(e.target.value)}
                className="soft-input w-full text-base"
              />
            </div>
            <div>
              <p className="mb-2 text-[15px] font-bold text-slate-800">절연저항 (MΩ)</p>
              <input
                type="number"
                inputMode="decimal"
                value={insulationResistance}
                onChange={(e) => setInsulationResistance(e.target.value)}
                placeholder="예: 0.15"
                className="soft-input w-full text-base"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-2 text-[15px] font-bold text-slate-800">콘센트 설치연도</p>
                <input
                  type="number"
                  inputMode="numeric"
                  value={outletInstallYear}
                  onChange={(e) => setOutletInstallYear(e.target.value)}
                  placeholder="예: 2014 (모르면 비워두세요)"
                  className="soft-input w-full text-base"
                />
              </div>
              <div>
                <p className="mb-2 text-[15px] font-bold text-slate-800">스위치 설치연도</p>
                <input
                  type="number"
                  inputMode="numeric"
                  value={switchInstallYear}
                  onChange={(e) => setSwitchInstallYear(e.target.value)}
                  placeholder="예: 2014 (모르면 비워두세요)"
                  className="soft-input w-full text-base"
                />
              </div>
            </div>
            <p className="-mt-2 text-[12px] text-slate-500">
              설치 후 10년이 지나면 회사 자체 기준으로 교체 권장 안내가 자동으로 붙어요(법적 의무 아님).
            </p>
            <div>
              <p className="mb-2 text-[15px] font-bold text-slate-800">기타사항</p>
              <textarea
                rows={3}
                value={etcNotes}
                onChange={(e) => setEtcNotes(e.target.value)}
                placeholder="현장 특이사항 (선택)"
                className="soft-input w-full text-base"
              />
            </div>
          </div>
        </SectionCard>
      ) : null}

      {step === 3 && inspectionType === "visit" ? (
        <SectionCard title="세대 확인">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[15px] font-bold text-slate-800">세대 성명 *</p>
              <input
                value={residentName}
                onChange={(e) => setResidentName(e.target.value)}
                placeholder="세대 거주자 성명"
                className="soft-input w-full text-base"
              />
            </div>
            <div>
              <p className="mb-2 text-[15px] font-bold text-slate-800">세대 연락처 *</p>
              <input
                value={residentPhone}
                onChange={(e) => setResidentPhone(e.target.value)}
                placeholder="010-1234-5678"
                inputMode="tel"
                className="soft-input w-full text-base"
              />
              <p className="mt-1 text-[12px] text-slate-500">점검 완료 즉시 이 번호로 AI 안전진단 결과를 문자로 보내드려요.</p>
            </div>
            <div>
              <p className="mb-2 text-[15px] font-bold text-slate-800">서명 *</p>
              <SignaturePad onChange={setSignatureData} />
            </div>
            <PrivacyConsentCheckbox
              checked={privacyConsent}
              onChange={setPrivacyConsent}
              items="세대주 성명, 휴대폰번호, 서명"
              purpose="세대전기점검(직무고시) 기록표 작성·발급, 점검결과 문자 안내"
              retention="「전기안전관리법」 제24조에 따라 4년간 보존"
            />
          </div>
        </SectionCard>
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
        {!isLastStep ? (
          <BigButton variant="primary" onClick={goNext} className="flex-[2]">
            {step === 0 && inspectionType === "unvisited_simple" ? "시작 (호만 눌러가며 연속입력)" : "다음"}
          </BigButton>
        ) : (
          <BigButton variant="primary" icon="📋" disabled={submitting} onClick={submit} className="flex-[2]">
            {submitting ? "저장 중..." : "점검 완료 · 자동진단"}
          </BigButton>
        )}
      </div>
    </div>
  );
}
