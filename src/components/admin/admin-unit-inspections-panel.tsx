"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { pickRepresentativeInspection, pickSupersededIdsInCurrentYear } from "@/lib/unit-inspection-representative";

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

type ApartmentOption = {
  id: string;
  name: string;
  electricalSafetyManagerName: string;
  totalUnits: number | null;
  partnershipType: "contract" | "unconfirmed" | "free_app" | "demo";
};

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
  /** 세대방문점검 우선순위 정책(2026-09-08) — latest(대표기록)와 같은 연도인데 밀려난 기록 id */
  supersededIds: Set<string>;
};

const RESULT_LABEL: Record<string, string> = { O: "○", X: "×", "/": "/", "N/A": "해당없음" };
const TYPE_LABEL: Record<UnitInspection["inspectionType"], string> = { visit: "세대방문점검", unvisited_simple: "세대미방문 간이점검" };
const PAGE_SIZE = 10;

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
  const [reissueLoadingId, setReissueLoadingId] = useState<string | null>(null);
  const [correctedPdfUrls, setCorrectedPdfUrls] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Record<string, boolean>>({});
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ residentName: "", residentPhone: "", dong: "", ho: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [inspRes, aptRes] = await Promise.all([
        fetch("/api/admin/unit-inspections", { cache: "no-store" }),
        fetch("/api/admin/apartments", { cache: "no-store" })
      ]);
      const inspData = (await inspRes.json()) as { inspections?: UnitInspection[]; pdfCorrections?: Record<string, string>; message?: string };
      const aptData = (await aptRes.json()) as { apartments?: ApartmentOption[]; message?: string };
      if (!inspRes.ok) {
        setMessage(inspData.message ?? "점검 목록 조회 실패");
        return;
      }
      setInspections(inspData.inspections ?? []);
      setApartments(aptData.apartments ?? []);
      setCorrectedPdfUrls(inspData.pdfCorrections ?? {});
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
      // 세대방문점검 우선순위 정책(2026-09-08): 그냥 최신 날짜가 아니라, 같은 세대·같은 해에
      // 방문점검이 있으면 순서와 무관하게 그게 대표기록이다.
      const latest = pickRepresentativeInspection(records);
      const supersededIds = pickSupersededIdsInCurrentYear(records);
      const residentRecord = records.find((r) => r.residentName && r.residentPhone) ?? null;
      result.push({
        key,
        apartmentId: latest.apartmentId,
        dong: latest.dong,
        ho: latest.ho,
        residentName: residentRecord?.residentName ?? null,
        residentPhone: residentRecord?.residentPhone ?? null,
        latest,
        records,
        supersededIds
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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE)), [filteredGroups.length]);

  const pagedGroups = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredGroups.slice(start, start + PAGE_SIZE);
  }, [filteredGroups, page]);

  useEffect(() => {
    setPage(1);
  }, [apartmentFilter, dongFilter, typeFilter, search]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const handleApartmentFilterChange = (name: string) => {
    setApartmentFilter(name);
    setDongFilter("전체");
  };

  const toggleRecordSelect = (id: string) => {
    setSelectedRecordIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = useMemo(() => Object.values(selectedRecordIds).filter(Boolean).length, [selectedRecordIds]);

  const clearSelection = () => setSelectedRecordIds({});

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

  // 이미 발급된 건은 DB 트리거가 원본 수정을 막으므로, 2026-08-24 문구 정리를 적용한 "수정본"만
  // 새 파일로 재발급한다 — 원본 pdfUrl은 그대로 두고 별도 링크로만 보여준다.
  const reissuePdf = async (id: string) => {
    setReissueLoadingId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/unit-inspections/${id}/reissue-pdf`, { method: "POST" });
      const data = (await response.json()) as { correctedPdfUrl?: string; message?: string };
      if (!response.ok || !data.correctedPdfUrl) {
        setMessage(data.message ?? "수정본 PDF 생성에 실패했습니다.");
        return;
      }
      setCorrectedPdfUrls((prev) => ({ ...prev, [id]: data.correctedPdfUrl! }));
    } finally {
      setReissueLoadingId(null);
    }
  };

  /** 관리자 전용 삭제(2026-09-10부터 실고객 단지도 가능) — RPC가 법정보관 불변성 트리거를
   * 우회하며 삭제 전 스냅샷을 unit_inspection_admin_audit_log에 남긴다(125). */
  const deleteRecord = async (id: string) => {
    if (!window.confirm("이 점검기록을 삭제할까요? 법정서식 원본이며, 삭제 이력은 감사로그에 남지만 되돌릴 수 없습니다.")) return;
    setDeletingId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/unit-inspections/${id}`, { method: "DELETE" });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "삭제에 실패했습니다.");
        return;
      }
      setSelectedRecordIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const deleteSelectedRecords = async () => {
    const ids = Object.entries(selectedRecordIds)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `선택한 ${ids.length}건을 삭제할까요? 법정서식 원본이며, 삭제 이력은 감사로그에 남지만 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    setMessage("");
    try {
      for (const id of ids) {
        const response = await fetch(`/api/admin/unit-inspections/${id}`, { method: "DELETE" });
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
          setMessage(`${id.slice(0, 8)}… 삭제 실패: ${data.message ?? response.status}`);
          break;
        }
      }
      setSelectedRecordIds({});
      await load();
    } finally {
      setBulkDeleting(false);
    }
  };

  const openEdit = (item: UnitInspection) => {
    setEditingRecordId(item.id);
    setEditDraft({
      residentName: item.residentName ?? "",
      residentPhone: item.residentPhone ?? "",
      dong: item.dong,
      ho: item.ho
    });
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingRecordId(null);
    setEditError(null);
  };

  const saveEdit = async (id: string) => {
    setEditError(null);
    if (!editDraft.dong.trim() || !editDraft.ho.trim()) {
      setEditError("동/호는 비워둘 수 없습니다.");
      return;
    }
    setEditBusy(true);
    try {
      const response = await fetch(`/api/admin/unit-inspections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentName: editDraft.residentName.trim() || null,
          residentPhone: editDraft.residentPhone.trim() || null,
          dong: editDraft.dong.trim(),
          ho: editDraft.ho.trim()
        })
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setEditError(data.message ?? "수정에 실패했습니다.");
        return;
      }
      setEditingRecordId(null);
      await load();
    } finally {
      setEditBusy(false);
    }
  };

  const resetDemoApartment = async () => {
    if (!selectedApartment) return;
    if (!window.confirm(`${selectedApartment.name}의 점검기록을 전부 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setResettingDemo(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/apartments/${selectedApartment.id}/reset-demo-inspections`, { method: "POST" });
      const data = (await response.json()) as { message?: string };
      setMessage(data.message ?? (response.ok ? "초기화했습니다." : "초기화에 실패했습니다."));
      if (response.ok) await load();
    } finally {
      setResettingDemo(false);
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
            <div className="flex gap-2">
              <button
                type="button"
                disabled={bulkDownloading}
                onClick={() => void bulkDownload()}
                className="rounded-md border border-dk-navy bg-dk-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {bulkDownloading ? "압축 중..." : "📦 발급완료 PDF 일괄 다운로드(zip)"}
              </button>
              {selectedApartment.partnershipType === "demo" ? (
                <button
                  type="button"
                  disabled={resettingDemo}
                  onClick={() => void resetDemoApartment()}
                  title="시연전용단지 전용 — 이 단지의 점검기록을 전부 삭제합니다"
                  className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                >
                  {resettingDemo ? "초기화 중..." : "🗑️ 시연단지 전체 초기화"}
                </button>
              ) : null}
            </div>
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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              세대(동/호) {filteredGroups.length}건 중 {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filteredGroups.length)}번째 표시 (한 페이지 {PAGE_SIZE}건)
            </p>
            {selectedCount > 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-1.5">
                <span className="text-xs font-bold text-rose-700">{selectedCount}건 선택됨</span>
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={() => void deleteSelectedRecords()}
                  className="rounded-md border border-rose-300 bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-800 disabled:opacity-50"
                >
                  {bulkDeleting ? "삭제 중..." : "선택 삭제"}
                </button>
                <button type="button" onClick={clearSelection} className="text-[11px] font-semibold text-slate-500 hover:underline">
                  선택 해제
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading && filteredGroups.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-2"></th>
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
                {pagedGroups.map((group) => {
                  const isOpen = expandedGroupKey === group.key;
                  const badCount = group.latest.checklistItems.filter((c) => c.result === "X").length;
                  const isEditingLatest = editingRecordId === group.latest.id;
                  return (
                    <Fragment key={group.key}>
                      <tr className="border-b border-slate-100">
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedRecordIds[group.latest.id])}
                            onChange={() => toggleRecordSelect(group.latest.id)}
                            aria-label={`선택 ${group.dong}동 ${group.ho}호`}
                          />
                        </td>
                        {isEditingLatest ? (
                          <>
                            <td className="py-2 pr-2">
                              <input
                                type="text"
                                value={editDraft.residentName}
                                onChange={(e) => setEditDraft((prev) => ({ ...prev, residentName: e.target.value }))}
                                placeholder="세대주"
                                className="soft-input w-full text-xs"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="text"
                                value={editDraft.residentPhone}
                                onChange={(e) => setEditDraft((prev) => ({ ...prev, residentPhone: e.target.value }))}
                                placeholder="연락처"
                                className="soft-input w-full text-xs"
                              />
                            </td>
                            <td className="py-2 pr-2" colSpan={2}>
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={editDraft.dong}
                                  onChange={(e) => setEditDraft((prev) => ({ ...prev, dong: e.target.value }))}
                                  placeholder="동"
                                  className="soft-input w-16 text-xs"
                                />
                                <input
                                  type="text"
                                  value={editDraft.ho}
                                  onChange={(e) => setEditDraft((prev) => ({ ...prev, ho: e.target.value }))}
                                  placeholder="호"
                                  className="soft-input w-16 text-xs"
                                />
                              </div>
                              {editError ? <p className="mt-1 text-[11px] font-semibold text-rose-600">{editError}</p> : null}
                            </td>
                            <td className="py-2 pr-2" colSpan={3}>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  disabled={editBusy}
                                  onClick={() => void saveEdit(group.latest.id)}
                                  className="rounded-md border border-dk-navy bg-dk-navy px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                                >
                                  {editBusy ? "저장 중..." : "저장"}
                                </button>
                                <button
                                  type="button"
                                  disabled={editBusy}
                                  onClick={cancelEdit}
                                  className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700"
                                >
                                  취소
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
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
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEdit(group.latest)}
                                  className="whitespace-nowrap text-xs font-bold text-sky-700 hover:underline"
                                  title="최근 점검기록(대표기록) 수정"
                                >
                                  ✏️ 수정
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingId === group.latest.id}
                                  onClick={() => void deleteRecord(group.latest.id)}
                                  className="whitespace-nowrap text-xs font-bold text-rose-700 hover:underline disabled:opacity-50"
                                  title="최근 점검기록(대표기록) 삭제"
                                >
                                  {deletingId === group.latest.id ? "삭제 중..." : "🗑️ 삭제"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpandedGroupKey(isOpen ? null : group.key)}
                                  className="whitespace-nowrap text-xs font-bold text-dk-navy hover:underline"
                                >
                                  점검기록 {isOpen ? "접기" : `${group.records.length}건 →`}
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                      {isOpen ? (
                        <tr key={`${group.key}-detail`}>
                          <td colSpan={9} className="bg-slate-50/60 px-2 pb-3 pt-1">
                            <ul className="space-y-2">
                              {group.records.map((item) => {
                                const isRecordOpen = expandedRecordId === item.id;
                                const badRows = item.checklistItems.filter((c) => c.result === "X");
                                const isEditing = editingRecordId === item.id;
                                return (
                                  <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="flex items-start gap-2">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(selectedRecordIds[item.id])}
                                          onChange={() => toggleRecordSelect(item.id)}
                                          aria-label={`선택 ${item.dong}동 ${item.ho}호 ${formatDate(item.inspectedAt)}`}
                                          className="mt-1"
                                        />
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
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => (isEditing ? cancelEdit() : openEdit(item))}
                                          className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700"
                                        >
                                          {isEditing ? "수정 취소" : "✏️ 수정"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setExpandedRecordId(isRecordOpen ? null : item.id)}
                                          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                                        >
                                          {isRecordOpen ? "접기" : "상세보기"}
                                        </button>
                                        {correctedPdfUrls[item.id] ? (
                                          // 문구가 수정된 새 파일이 있으면 그게 곧 "그 건의 PDF"다 — 구버전 원본
                                          // 링크는 더 이상 노출하지 않는다(스토리지 원본 파일 자체는 법적 보존
                                          // 요건 때문에 그대로 남아있지만, 화면에서는 이걸로 대체해 보여준다).
                                          <a
                                            href={correctedPdfUrls[item.id]}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                                          >
                                            PDF 다운로드
                                          </a>
                                        ) : item.pdfUrl ? (
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
                                        {item.pdfUrl && !correctedPdfUrls[item.id] ? (
                                          <button
                                            type="button"
                                            disabled={reissueLoadingId === item.id}
                                            onClick={() => void reissuePdf(item.id)}
                                            title="원본 파일은 법적 보존 요건상 그대로 두고, 최신 문구를 적용한 새 PDF로 화면 표시를 교체합니다"
                                            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 disabled:opacity-50"
                                          >
                                            {reissueLoadingId === item.id ? "재발급 중..." : "문구 수정본 재발급"}
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          disabled={deletingId === item.id}
                                          onClick={() => void deleteRecord(item.id)}
                                          title="법정서식 원본입니다 — 관리자 삭제는 감사로그에 기록됩니다"
                                          className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50"
                                        >
                                          {deletingId === item.id ? "삭제 중..." : "삭제"}
                                        </button>
                                      </div>
                                    </div>

                                    {isEditing ? (
                                      <div className="mt-3 space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
                                        <p className="text-[11px] font-semibold text-sky-800">
                                          법정서식 원본 수정입니다(관리자 전용, 감사로그에 기록됩니다).
                                        </p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                          <label className="text-xs text-slate-600">
                                            세대주
                                            <input
                                              type="text"
                                              value={editDraft.residentName}
                                              onChange={(e) => setEditDraft((prev) => ({ ...prev, residentName: e.target.value }))}
                                              className="soft-input mt-0.5 w-full text-xs"
                                            />
                                          </label>
                                          <label className="text-xs text-slate-600">
                                            연락처
                                            <input
                                              type="text"
                                              value={editDraft.residentPhone}
                                              onChange={(e) => setEditDraft((prev) => ({ ...prev, residentPhone: e.target.value }))}
                                              className="soft-input mt-0.5 w-full text-xs"
                                            />
                                          </label>
                                          <label className="text-xs text-slate-600">
                                            동
                                            <input
                                              type="text"
                                              value={editDraft.dong}
                                              onChange={(e) => setEditDraft((prev) => ({ ...prev, dong: e.target.value }))}
                                              className="soft-input mt-0.5 w-full text-xs"
                                            />
                                          </label>
                                          <label className="text-xs text-slate-600">
                                            호
                                            <input
                                              type="text"
                                              value={editDraft.ho}
                                              onChange={(e) => setEditDraft((prev) => ({ ...prev, ho: e.target.value }))}
                                              className="soft-input mt-0.5 w-full text-xs"
                                            />
                                          </label>
                                        </div>
                                        {editError ? <p className="text-[11px] font-semibold text-rose-600">{editError}</p> : null}
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            disabled={editBusy}
                                            onClick={() => void saveEdit(item.id)}
                                            className="rounded-md border border-dk-navy bg-dk-navy px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                          >
                                            {editBusy ? "저장 중..." : "저장"}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={editBusy}
                                            onClick={cancelEdit}
                                            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                                          >
                                            취소
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}

                                    {group.supersededIds.has(item.id) ? (
                                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                                        이후 세대방문점검이 진행되어 올해 대표기록이 아닙니다 → {formatDate(group.latest.inspectedAt)}{" "}
                                        {TYPE_LABEL[group.latest.inspectionType]} 기록이 대표기록입니다.
                                      </p>
                                    ) : null}

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

        {!loading && filteredGroups.length > PAGE_SIZE ? (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
            >
              이전
            </button>
            <span className="text-xs font-semibold text-slate-600">
              {page} / {totalPages}페이지
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
            >
              다음
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
