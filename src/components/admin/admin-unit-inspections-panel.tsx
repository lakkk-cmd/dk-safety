"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type ChecklistItem = { id: string; category: string; item: string; result: "O" | "X" | "/" | "N/A"; note: string };
type DiagnosisEntry = { item: string; verdict: string; regulation: string; actionTypes: string[]; comment: string };
type CompanyAdvisoryEntry = { item: string; comment: string };

type UnitInspection = {
  id: string;
  apartmentId: string;
  dong: string;
  ho: string;
  inspectionType: "visit" | "unvisited_simple";
  inspectedAt: string;
  checklistItems: ChecklistItem[];
  loadCurrent: number | null;
  igr: number | null;
  insulationResistance: number | null;
  etcNotes: string;
  autoDiagnosis: DiagnosisEntry[];
  companyAdvisories: CompanyAdvisoryEntry[];
  outletInstallYear: number | null;
  switchInstallYear: number | null;
  residentName: string | null;
  residentPhone: string | null;
  pdfUrl: string | null;
};

type ApartmentOption = { id: string; name: string; electricalSafetyManagerName: string; totalUnits: number | null };

type TypeFilter = "all" | "visit" | "unvisited_simple";

/** 세대(동/호) 단위로 묶은 행 — "직무고시별 보기"를 고객별 보기와 같은 세대 단위 표로 구성하기 위함(2026-08-24).
 * 세대미방문 간이점검(EPS실 등)은 애초에 세대주 성명·연락처를 받지 않으므로, 같은 세대에서
 * 방문점검 이력이 한 번도 없었다면 residentName/residentPhone이 null로 남아 "정보없음"으로 표시된다. */
type UnitGroup = {
  key: string;
  apartmentId: string;
  dong: string;
  ho: string;
  residentName: string | null;
  residentPhone: string | null;
  latest: UnitInspection;
  records: UnitInspection[];
};

const RESULT_LABEL: Record<string, string> = { O: "○", X: "×", "/": "/", "N/A": "해당없음" };
const TYPE_LABEL: Record<UnitInspection["inspectionType"], string> = { visit: "세대방문점검", unvisited_simple: "세대미방문 간이점검" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function AdminUnitInspectionsPanel() {
  const [inspections, setInspections] = useState<UnitInspection[]>([]);
  const [apartments, setApartments] = useState<ApartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [apartmentFilter, setApartmentFilter] = useState("전체");
  const [dongFilter, setDongFilter] = useState("전체");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [inspRes, aptRes] = await Promise.all([
        fetch("/api/admin/unit-inspections", { cache: "no-store" }),
        fetch("/api/admin/apartments", { cache: "no-store" })
      ]);
      const inspData = (await inspRes.json()) as { inspections?: UnitInspection[]; message?: string };
      const aptData = (await aptRes.json()) as { apartments?: ApartmentOption[]; message?: string };
      if (!inspRes.ok) {
        setMessage(inspData.message ?? "점검 목록 조회 실패");
        return;
      }
      setInspections(inspData.inspections ?? []);
      setApartments(aptData.apartments ?? []);
      setMessage("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const apartmentNameById = useMemo(() => new Map(apartments.map((a) => [a.id, a.name])), [apartments]);
  const apartmentByName = useMemo(() => new Map(apartments.map((a) => [a.name, a])), [apartments]);
  const selectedApartment = apartmentFilter === "전체" ? null : (apartmentByName.get(apartmentFilter) ?? null);

  const apartmentTabs = useMemo(() => {
    const names = new Set(inspections.map((i) => apartmentNameById.get(i.apartmentId) ?? "미지정"));
    return ["전체", ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [inspections, apartmentNameById]);

  // 선택된 단지 범위(동/유형/검색 필터 적용 전) — 처리율 계산과 동 목록 산출에 쓴다.
  const byApartment = useMemo(() => {
    if (apartmentFilter === "전체") return inspections;
    return inspections.filter((i) => (apartmentNameById.get(i.apartmentId) ?? "미지정") === apartmentFilter);
  }, [inspections, apartmentFilter, apartmentNameById]);

  const dongOptions = useMemo(() => {
    const dongs = new Set(byApartment.map((i) => i.dong));
    return ["전체", ...Array.from(dongs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }, [byApartment]);

  const byDong = useMemo(() => {
    if (dongFilter === "전체") return byApartment;
    return byApartment.filter((i) => i.dong === dongFilter);
  }, [byApartment, dongFilter]);

  const byType = useMemo(() => {
    if (typeFilter === "all") return byDong;
    return byDong.filter((i) => i.inspectionType === typeFilter);
  }, [byDong, typeFilter]);

  // 처리율 = 점검완료(동/호 중복제거, 최신건만 인정)한 세대수 / 총세대수. 방문·미방문 간이점검
  // 둘 다 유효한 처리로 인정한다(가이드상 미방문 시 점검가능 항목만 하는 것도 정식 절차).
  // 동/유형/검색 필터와 무관하게 단지 전체 진행률을 보여줘야 하므로 byApartment 기준으로 계산한다.
  const distinctInspectedUnitCount = useMemo(() => {
    const keys = new Set(byApartment.map((i) => `${i.dong}-${i.ho}`));
    return keys.size;
  }, [byApartment]);

  // 동/호(세대) 단위로 묶는다 — 세대미방문 간이점검은 세대주 성명·연락처가 없으므로, 같은 세대에
  // 방문점검 이력이 있으면 그 정보를 물려받고 없으면 "정보없음"으로 남는다.
  const groups = useMemo(() => {
    const map = new Map<string, UnitInspection[]>();
    for (const item of byType) {
      const key = `${item.apartmentId}|${item.dong}|${item.ho}`;
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    const result: UnitGroup[] = [];
    for (const [key, records] of map) {
      records.sort((a, b) => new Date(b.inspectedAt).getTime() - new Date(a.inspectedAt).getTime());
      const latest = records[0];
      const residentRecord = records.find((r) => r.residentName && r.residentPhone) ?? null;
      result.push({
        key,
        apartmentId: latest.apartmentId,
        dong: latest.dong,
        ho: latest.ho,
        residentName: residentRecord?.residentName ?? null,
        residentPhone: residentRecord?.residentPhone ?? null,
        latest,
        records
      });
    }
    result.sort((a, b) => new Date(b.latest.inspectedAt).getTime() - new Date(a.latest.inspectedAt).getTime());
    return result;
  }, [byType]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/[^0-9]/g, "");
    if (!q) return groups;
    return groups.filter((g) => {
      const nameMatch = g.residentName?.toLowerCase().includes(q) ?? false;
      const phoneMatch = qDigits.length > 0 && (g.residentPhone ?? "").replace(/[^0-9]/g, "").includes(qDigits);
      const unitMatch = `${g.dong}${g.ho}`.toLowerCase().includes(q);
      return nameMatch || phoneMatch || unitMatch;
    });
  }, [groups, search]);

  const handleApartmentFilterChange = (name: string) => {
    setApartmentFilter(name);
    setDongFilter("전체");
  };

  const issuePdf = async (id: string) => {
    setPdfLoadingId(id);
    try {
      const response = await fetch(`/api/admin/unit-inspections/${id}/pdf`, { method: "POST" });
      const data = (await response.json()) as { pdfUrl?: string; message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "PDF 생성에 실패했습니다.");
        return;
      }
      setInspections((prev) => prev.map((i) => (i.id === id ? { ...i, pdfUrl: data.pdfUrl ?? i.pdfUrl } : i)));
    } finally {
      setPdfLoadingId(null);
    }
  };

  const bulkDownload = async () => {
    if (!selectedApartment) return;
    setBulkDownloading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ apartmentId: selectedApartment.id });
      if (dongFilter !== "전체") params.set("dong", dongFilter);
      const response = await fetch(`/api/admin/unit-inspections/bulk-pdf?${params.toString()}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setMessage(data.message ?? "일괄 다운로드에 실패했습니다.");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const fileName = match ? decodeURIComponent(match[1]) : "세대전기점검표.zip";
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setMessage("네트워크 오류로 일괄 다운로드에 실패했습니다.");
    } finally {
      setBulkDownloading(false);
    }
  };

  const TYPE_CHIPS: { value: TypeFilter; label: string }[] = [
    { value: "all", label: "전체 유형" },
    { value: "visit", label: "세대방문점검" },
    { value: "unvisited_simple", label: "세대미방문 간이점검" }
  ];

  return (
    <section className="space-y-4">
      <div className="surface-card rounded-2xl p-4">
        <p className="warranty-badge">세대전기점검(직무고시) 조회</p>
        <h2 className="text-lg font-bold">세대전기점검(직무고시)표 목록</h2>
        <p className="mt-1 text-xs text-slate-600">
          직무고시 별지 15호 서식 — 세대(동/호) 단위로 묶어 조회하고 PDF를 발급합니다. 세대미방문 간이점검은 세대주 정보를 받지 않는
          유형이라, 방문점검 이력이 없는 세대는 &quot;정보없음&quot;으로 표시됩니다.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {apartmentTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleApartmentFilterChange(tab)}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                apartmentFilter === tab ? "border-dk-navy bg-dk-navy text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {selectedApartment ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
            <div>
              <p className="text-sm font-bold text-slate-800">
                처리율:{" "}
                {selectedApartment.totalUnits === null ? (
                  <span className="text-amber-600">총세대수 미설정 — /admin/apartments에서 입력해주세요</span>
                ) : (
                  <>
                    {distinctInspectedUnitCount} / {selectedApartment.totalUnits}세대 (
                    {Math.min(100, Math.round((distinctInspectedUnitCount / selectedApartment.totalUnits) * 100))}%)
                  </>
                )}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500">동 선택</label>
                <select value={dongFilter} onChange={(e) => setDongFilter(e.target.value)} className="soft-input text-xs">
                  {dongOptions.map((d) => (
                    <option key={d} value={d}>
                      {d === "전체" ? "전체 동" : `${d}동`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              disabled={bulkDownloading}
              onClick={() => void bulkDownload()}
              className="rounded-md border border-dk-navy bg-dk-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {bulkDownloading ? "압축 중..." : "📦 발급완료 PDF 일괄 다운로드(zip)"}
            </button>
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="세대주 이름, 연락처, 동/호로 검색"
            className="soft-input w-full text-xs sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {TYPE_CHIPS.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() => setTypeFilter(chip.value)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                  typeFilter === chip.value ? "border-dk-navy bg-dk-navy text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {message ? <p className="mt-2 text-sm text-rose-600">{message}</p> : null}
        {loading ? <p className="mt-3 text-sm text-slate-500">불러오는 중...</p> : null}

        {!loading && filteredGroups.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
            조건에 맞는 점검 기록이 없습니다.
          </p>
        ) : null}

        {!loading && filteredGroups.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-2">세대주</th>
                  <th className="py-2 pr-2">연락처</th>
                  <th className="py-2 pr-2">주소</th>
                  <th className="py-2 pr-2">점검횟수</th>
                  <th className="py-2 pr-2">최근 점검일</th>
                  <th className="py-2 pr-2">점검유형</th>
                  <th className="py-2 pr-2">부적합</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((group) => {
                  const isOpen = expandedGroupKey === group.key;
                  const badCount = group.latest.checklistItems.filter((c) => c.result === "X").length;
                  return (
                    <Fragment key={group.key}>
                      <tr className="border-b border-slate-100">
                        <td className="py-2 pr-2 font-semibold text-slate-900">
                          {group.residentName ?? <span className="italic text-slate-400">정보없음</span>}
                        </td>
                        <td className="py-2 pr-2 text-slate-700">{group.residentPhone ?? "-"}</td>
                        <td className="py-2 pr-2 text-slate-700">
                          {group.dong}동 {group.ho}호
                          <p className="text-[11px] text-slate-400">{apartmentNameById.get(group.apartmentId) ?? "미지정"}</p>
                        </td>
                        <td className="py-2 pr-2">
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">{group.records.length}</span>
                        </td>
                        <td className="py-2 pr-2 text-slate-700">{formatDateShort(group.latest.inspectedAt)}</td>
                        <td className="py-2 pr-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                            {TYPE_LABEL[group.latest.inspectionType]}
                          </span>
                        </td>
                        <td className="py-2 pr-2">
                          {badCount > 0 ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">부적합 {badCount}건</span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">없음</span>
                          )}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => setExpandedGroupKey(isOpen ? null : group.key)}
                            className="whitespace-nowrap text-xs font-bold text-dk-navy hover:underline"
                          >
                            점검기록 {isOpen ? "접기" : `${group.records.length}건 →`}
                          </button>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr key={`${group.key}-detail`}>
                          <td colSpan={8} className="bg-slate-50/60 px-2 pb-3 pt-1">
                            <ul className="space-y-2">
                              {group.records.map((item) => {
                                const isRecordOpen = expandedRecordId === item.id;
                                const badRows = item.checklistItems.filter((c) => c.result === "X");
                                return (
                                  <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <p className="font-semibold text-slate-900">
                                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                            {TYPE_LABEL[item.inspectionType]}
                                          </span>
                                          {badRows.length > 0 ? (
                                            <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                              부적합 {badRows.length}건
                                            </span>
                                          ) : null}
                                        </p>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                          {formatDate(item.inspectedAt)} {item.residentName ? `· ${item.residentName}` : ""}
                                        </p>
                                      </div>
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setExpandedRecordId(isRecordOpen ? null : item.id)}
                                          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                                        >
                                          {isRecordOpen ? "접기" : "상세보기"}
                                        </button>
                                        {item.pdfUrl ? (
                                          <a
                                            href={item.pdfUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                                          >
                                            PDF 다운로드
                                          </a>
                                        ) : (
                                          <button
                                            type="button"
                                            disabled={pdfLoadingId === item.id}
                                            onClick={() => void issuePdf(item.id)}
                                            className="rounded-md border border-dk-navy bg-dk-navy px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                          >
                                            {pdfLoadingId === item.id ? "발급 중..." : "PDF 발급"}
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {isRecordOpen ? (
                                      <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                                        <div className="grid gap-1 text-xs text-slate-700 sm:grid-cols-3">
                                          <p>부하전류: {item.loadCurrent ?? "-"} A</p>
                                          <p>IGR·누설전류: {item.igr ?? "-"} mA</p>
                                          <p>절연저항: {item.insulationResistance ?? "-"} MΩ</p>
                                        </div>
                                        {item.etcNotes ? <p className="text-xs text-slate-600">기타사항: {item.etcNotes}</p> : null}
                                        {item.outletInstallYear || item.switchInstallYear ? (
                                          <p className="text-xs text-slate-600">
                                            {item.outletInstallYear ? `콘센트 설치연도: ${item.outletInstallYear}년 ` : ""}
                                            {item.switchInstallYear ? `스위치 설치연도: ${item.switchInstallYear}년` : ""}
                                          </p>
                                        ) : null}

                                        <table className="w-full text-left text-xs">
                                          <thead>
                                            <tr className="text-slate-500">
                                              <th className="py-1 pr-2">부적합 설비</th>
                                              <th className="py-1 pr-2">확인 사항</th>
                                              <th className="py-1 pr-2">결과</th>
                                              <th className="py-1">비고</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {item.checklistItems.map((c) => (
                                              <tr key={c.id} className={c.result === "X" ? "text-rose-700" : "text-slate-700"}>
                                                <td className="py-1 pr-2">{c.category}</td>
                                                <td className="py-1 pr-2">{c.item}</td>
                                                <td className="py-1 pr-2 font-bold">{RESULT_LABEL[c.result] ?? c.result}</td>
                                                <td className="py-1">{c.note}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>

                                        {item.autoDiagnosis.length > 0 ? (
                                          <div className="rounded-lg bg-rose-50 p-3">
                                            <p className="text-xs font-bold text-rose-700">AI 안전진단</p>
                                            <ul className="mt-1 space-y-1.5">
                                              {item.autoDiagnosis.map((d, idx) => (
                                                <li key={idx} className="text-xs text-rose-800">
                                                  <span className="font-semibold">{d.item}</span> — {d.regulation}
                                                  <br />
                                                  {d.comment}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        ) : null}

                                        {item.companyAdvisories.length > 0 ? (
                                          <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
                                            <p className="text-xs font-bold text-amber-800">우리집 전기주치의 자체 권장사항</p>
                                            <p className="mt-0.5 text-[11px] text-amber-600">※ 직무고시·별표3 등 법적 근거가 아닌 자체 점검 기준</p>
                                            <ul className="mt-1 space-y-1.5">
                                              {item.companyAdvisories.map((d, idx) => (
                                                <li key={idx} className="text-xs text-amber-800">
                                                  <span className="font-semibold">{d.item}</span> — {d.comment}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
