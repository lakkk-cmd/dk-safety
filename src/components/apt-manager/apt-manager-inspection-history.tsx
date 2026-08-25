"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";

type ChecklistItem = { id: string; category: string; item: string; result: "O" | "X" | "/" | "N/A"; note: string };
type DiagnosisEntry = { item: string; verdict: string; regulation: string; actionTypes: string[]; comment: string };

type UnitInspection = {
  id: string;
  dong: string;
  ho: string;
  inspectionType: "visit" | "unvisited_simple";
  inspectedAt: string;
  checklistItems: ChecklistItem[];
  autoDiagnosis: DiagnosisEntry[];
  residentName: string | null;
  pdfUrl: string | null;
};

type UnitGroup = {
  key: string;
  dong: string;
  ho: string;
  latest: UnitInspection;
  records: UnitInspection[];
};

const TYPE_LABEL: Record<UnitInspection["inspectionType"], string> = { visit: "세대방문점검", unvisited_simple: "세대미방문 간이점검" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AptManagerInspectionHistory() {
  const [inspections, setInspections] = useState<UnitInspection[]>([]);
  const [pdfCorrections, setPdfCorrections] = useState<Record<string, string>>({});
  const [totalUnits, setTotalUnits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dongFilter, setDongFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [inspRes, meRes] = await Promise.all([
          fetch("/api/apt-manager/unit-inspections", { cache: "no-store" }),
          fetch("/api/apt-manager/me", { cache: "no-store" })
        ]);
        const inspData = (await inspRes.json()) as { inspections?: UnitInspection[]; pdfCorrections?: Record<string, string> };
        const meData = (await meRes.json()) as { apartment?: { totalUnits: number | null } | null };
        if (inspRes.ok) {
          setInspections(inspData.inspections ?? []);
          setPdfCorrections(inspData.pdfCorrections ?? {});
        }
        if (meRes.ok) setTotalUnits(meData.apartment?.totalUnits ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, UnitGroup>();
    for (const insp of inspections) {
      const key = `${insp.dong}|${insp.ho}`;
      const existing = map.get(key);
      if (existing) {
        existing.records.push(insp);
        if (new Date(insp.inspectedAt) > new Date(existing.latest.inspectedAt)) existing.latest = insp;
      } else {
        map.set(key, { key, dong: insp.dong, ho: insp.ho, latest: insp, records: [insp] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.dong.localeCompare(b.dong, undefined, { numeric: true }) || a.ho.localeCompare(b.ho, undefined, { numeric: true }));
  }, [inspections]);

  const dongOptions = useMemo(() => ["전체", ...Array.from(new Set(groups.map((g) => g.dong))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))], [groups]);

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (dongFilter !== "전체" && g.dong !== dongFilter) return false;
      if (search.trim() && !`${g.dong}동 ${g.ho}호`.includes(search.trim())) return false;
      return true;
    });
  }, [groups, dongFilter, search]);

  const processedCount = groups.length;
  const rate = totalUnits && totalUnits > 0 ? Math.round((processedCount / totalUnits) * 100) : null;

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-500">불러오는 중...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dk-blue/20 bg-white p-4 shadow-sm">
        <p className="text-[13px] font-semibold text-slate-500">점검 처리율</p>
        <p className="mt-1 text-2xl font-black text-dk-navy">
          {processedCount}
          {totalUnits ? <span className="text-base font-bold text-slate-400"> / {totalUnits}세대</span> : "세대"}
          {rate !== null ? <span className="ml-2 text-base font-bold text-dk-blue">{rate}%</span> : null}
        </p>
        {totalUnits === null ? <p className="mt-1 text-xs text-slate-400">총세대수가 등록되지 않아 처리율은 계산하지 않아요.</p> : null}
      </div>

      <div className="flex gap-2">
        <select value={dongFilter} onChange={(e) => setDongFilter(e.target.value)} className="soft-input flex-1 text-sm">
          {dongOptions.map((d) => (
            <option key={d} value={d}>
              {d === "전체" ? "전체 동" : `${d}동`}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="동/호 검색 (예: 101동 502호)"
          className="soft-input flex-[2] text-sm"
        />
      </div>

      {filteredGroups.length === 0 ? (
        <EmptyState icon="📋" title="아직 점검 기록이 없어요" description="점검입력 탭에서 첫 점검을 등록해보세요." />
      ) : (
        <ul className="space-y-2">
          {filteredGroups.map((g) => {
            const badCount = g.latest.autoDiagnosis.length;
            const correctedPdfUrl = pdfCorrections[g.latest.id];
            const pdfUrl = correctedPdfUrl ?? g.latest.pdfUrl;
            const expanded = expandedKey === g.key;
            return (
              <li key={g.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setExpandedKey(expanded ? null : g.key)}>
                  <div>
                    <p className="text-[15px] font-bold text-dk-navy">
                      {g.dong}동 {g.ho}호
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(g.latest.inspectedAt)} · {TYPE_LABEL[g.latest.inspectionType]}
                      {g.records.length > 1 ? ` · 총 ${g.records.length}회` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      badCount > 0 ? "bg-dk-red/10 text-dk-red" : "bg-dk-green/10 text-dk-green"
                    }`}
                  >
                    {badCount > 0 ? `부적합 ${badCount}건` : "적합"}
                  </span>
                </button>
                {expanded ? (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {g.latest.residentName ? <p className="text-sm text-slate-600">세대주: {g.latest.residentName}</p> : null}
                    {pdfUrl ? (
                      <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-block rounded-xl bg-dk-blue px-4 py-2 text-sm font-bold text-white">
                        📄 점검표 PDF 다운로드
                      </a>
                    ) : (
                      <p className="text-xs text-slate-400">PDF가 아직 발급되지 않았어요(미방문 간이점검은 PDF를 발급하지 않아요).</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
