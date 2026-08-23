"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BigButton } from "@/components/ui/big-button";
import { SectionCard } from "@/components/ui/section-card";
import { StepProgress } from "@/components/ui/step-progress";
import { EmptyState } from "@/components/ui/empty-state";
import SignaturePad from "@/components/worker/signature-pad";
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
  insulation_resistance_threshold_mohm: number | null;
  leakage_current_threshold_ma: number | null;
};

type DiagnosisEntry = {
  item: string;
  verdict: string;
  regulation: string;
  actionTypes: string[];
  comment: string;
};

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

export default function UnitInspectionForm() {
  const [apartments, setApartments] = useState<ApartmentOption[]>([]);
  const [loadingApartments, setLoadingApartments] = useState(true);

  const [apartmentId, setApartmentId] = useState("");
  const [apartmentQuery, setApartmentQuery] = useState("");
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
  const [etcNotes, setEtcNotes] = useState("");

  const [residentName, setResidentName] = useState("");
  const [residentPhone, setResidentPhone] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{
    diagnosis: DiagnosisEntry[];
    apartmentName: string;
    notificationSent: boolean | null;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/worker/apartments", { cache: "no-store" });
        const data = (await response.json()) as { apartments?: ApartmentOption[]; message?: string };
        if (response.ok) setApartments(data.apartments ?? []);
      } finally {
        setLoadingApartments(false);
      }
    })();
  }, []);

  const stepLabels = useMemo(
    () => (inspectionType === "visit" ? ["기본정보", "점검항목", "실측값", "서명"] : ["기본정보", "점검항목", "실측값"]),
    [inspectionType]
  );
  const isLastStep = step === stepLabels.length - 1;
  const selectedApartment = apartments.find((a) => a.id === apartmentId) ?? null;
  const insulationThresholdConfigured = selectedApartment?.insulation_resistance_threshold_mohm != null;
  const leakageThresholdConfigured = selectedApartment?.leakage_current_threshold_ma != null;

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

  const stepValid = (idx: number): boolean => {
    if (idx === 0) return Boolean(apartmentId && dong.trim() && ho.trim());
    if (idx === 1) return uncheckedManualIds.length === 0;
    if (idx === stepLabels.length - 1 && inspectionType === "visit") {
      return Boolean(residentName.trim() && signatureData && /^01[0-9]-?\d{3,4}-?\d{4}$/.test(residentPhone.trim()));
    }
    return true;
  };

  const goNext = () => {
    if (!stepValid(step)) {
      if (step === 0) setMessage("단지·동·호를 모두 입력해주세요.");
      else if (step === 1) setMessage(`현장에서 직접 확인해야 하는 항목이 ${uncheckedManualIds.length}개 남았어요. ○/×/  중 하나를 눌러주세요.`);
      else setMessage("세대 성명·연락처·서명을 모두 입력해주세요.");
      return;
    }
    setMessage(null);
    setStep((s) => Math.min(s + 1, stepLabels.length - 1));
  };

  const submit = async () => {
    if (!stepValid(step)) {
      setMessage("세대 성명·연락처·서명을 모두 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      // 절연 2항목(requiresManualCheck: false)은 서버가 절연저항 실측값으로 자동판정하므로
      // 보낼 필요가 없다 — 수동확인이 필요한 항목만 담는다(우린 이미 stepValid로 전부 채워졌음을 확인함).
      const checklistResults = requiredManualIdsForType.map((id) => ({ id, result: results[id]!, note: notes[id] }));

      const response = await fetch("/api/worker/unit-inspections", {
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
          etcNotes,
          residentName: inspectionType === "visit" ? residentName : null,
          residentPhone: inspectionType === "visit" ? residentPhone : null,
          signatureData: inspectionType === "visit" ? signatureData : null
        })
      });
      const data = (await response.json()) as {
        inspection?: { autoDiagnosis?: DiagnosisEntry[] };
        notification?: { success?: boolean };
        message?: string;
      };
      if (!response.ok) {
        setMessage(data.message ?? "저장에 실패했습니다.");
        return;
      }
      const apartmentName = apartments.find((a) => a.id === apartmentId)?.name ?? "";
      setResult({
        diagnosis: data.inspection?.autoDiagnosis ?? [],
        apartmentName,
        notificationSent: inspectionType === "visit" ? Boolean(data.notification?.success) : null
      });
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
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
        <div className="flex gap-2">
          <BigButton variant="secondary" onClick={resetForNext} className="flex-1">
            다음 세대 점검
          </BigButton>
          <Link href="/worker" className="flex-1">
            <BigButton variant="primary" className="w-full">
              목록으로
            </BigButton>
          </Link>
        </div>
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
              {loadingApartments ? (
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
            </div>

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
                    const thresholdConfigured = isLeakageItem ? leakageThresholdConfigured : insulationThresholdConfigured;
                    const thresholdLabel = isLeakageItem
                      ? `이 단지 기준값 ${selectedApartment?.leakage_current_threshold_ma}mA`
                      : `이 단지 기준값 ${selectedApartment?.insulation_resistance_threshold_mohm}MΩ`;
                    const measurementLabel = isLeakageItem ? "누설전류(IGR)" : "절연저항";
                    const missingLabel = isLeakageItem ? "누설전류(IGR)" : "절연저항";
                    return (
                      <div key={id}>
                        <p className="mb-1 text-[14px] font-semibold text-slate-800">{def.label}</p>
                        {thresholdConfigured ? (
                          <p className="rounded-xl bg-dk-sky px-3 py-2 text-[13px] text-dk-navy">
                            ⚡ 실측값(다음 단계의 {measurementLabel}, {thresholdLabel}) 기준으로 자동 판정됩니다 — 여기서 누를 필요
                            없어요.
                            {isLeakageItem ? " 단, \"미설치\"는 실측만으로 잡히지 않으니 육안으로 함께 확인해주세요." : ""}
                          </p>
                        ) : (
                          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
                            ⚠️ 이 단지는 {missingLabel} 기준값이 아직 설정되지 않아 자동 판정이 보류됩니다(해당없음 처리). 관리자에게
                            단지 설정을 요청해주세요.
                          </p>
                        )}
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
              <p className="mt-1 text-[12px] text-slate-500">점검 완료 즉시 이 번호로 자동 안전진단 결과를 문자로 보내드려요.</p>
            </div>
            <div>
              <p className="mb-2 text-[15px] font-bold text-slate-800">서명 *</p>
              <SignaturePad onChange={setSignatureData} />
            </div>
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
            다음
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
