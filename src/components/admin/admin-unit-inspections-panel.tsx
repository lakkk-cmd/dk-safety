"use client";

import { useEffect, useMemo, useState } from "react";

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
  pdfUrl: string | null;
};

type ApartmentOption = { id: string; name: string; electricalSafetyManagerName: string; totalUnits: number | null };

const RESULT_LABEL: Record<string, string> = { O: "○", X: "×", "/": "/", "N/A": "해당없음" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminUnitInspectionsPanel() {
  const [inspections, setInspections] = useState<UnitInspection[]>([]);
  const [apartments, setApartments] = useState<ApartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [apartmentFilter, setApartmentFilter] = useState("전체");
  const [dongFilter, setDongFilter] = useState("전체");
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  // 선택된 단지 범위(동 필터 적용 전) — 처리율 계산과 동 목록 산출에 쓴다.
  const byApartment = useMemo(() => {
    if (apartmentFilter === "전체") return inspections;
    return inspections.filter((i) => (apartmentNameById.get(i.apartmentId) ?? "미지정") === apartmentFilter);
  }, [inspections, apartmentFilter, apartmentNameById]);

  const dongOptions = useMemo(() => {
    const dongs = new Set(byApartment.map((i) => i.dong));
    return ["전체", ...Array.from(dongs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }, [byApartment]);

  const filtered = useMemo(() => {
    if (dongFilter === "전체") return byApartment;
    return byApartment.filter((i) => i.dong === dongFilter);
  }, [byApartment, dongFilter]);

  // 처리율 = 점검완료(동/호 중복제거, 최신건만 인정)한 세대수 / 총세대수. 방문·미방문 간이점검
  // 둘 다 유효한 처리로 인정한다(가이드상 미방문 시 점검가능 항목만 하는 것도 정식 절차).
  const distinctInspectedUnitCount = useMemo(() => {
    const keys = new Set(byApartment.map((i) => `${i.dong}-${i.ho}`));
    return keys.size;
  }, [byApartment]);

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

  return (
    <section className="space-y-4">
      <div className="surface-card rounded-2xl p-4">
        <p className="warranty-badge">세대전기점검(직무고시) 조회</p>
        <h2 className="text-lg font-bold">세대전기점검(직무고시)표 목록</h2>
        <p className="mt-1 text-xs text-slate-600">직무고시 별지 15호 서식 — 워커가 제출한 점검 기록을 조회하고 PDF를 발급합니다.</p>

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

        {message ? <p className="mt-2 text-sm text-rose-600">{message}</p> : null}
        {loading ? <p className="mt-3 text-sm text-slate-500">불러오는 중...</p> : null}

        {!loading && filtered.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
            조건에 맞는 점검 기록이 없습니다.
          </p>
        ) : null}

        <ul className="mt-3 space-y-2">
          {filtered.map((item) => {
            const isOpen = expandedId === item.id;
            const badRows = item.checklistItems.filter((c) => c.result === "X");
            return (
              <li key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {apartmentNameById.get(item.apartmentId) ?? "미지정"} {item.dong}동 {item.ho}호{" "}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {item.inspectionType === "visit" ? "세대방문점검" : "세대미방문 간이점검"}
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
                      onClick={() => setExpandedId(isOpen ? null : item.id)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      {isOpen ? "접기" : "상세보기"}
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

                {isOpen ? (
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
                        <p className="text-xs font-bold text-rose-700">자동 안전진단</p>
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
      </div>
    </section>
  );
}
