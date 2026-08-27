"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

type QuotaSummary = {
  subscribed: boolean;
  remainingFree: number;
  freeQuotaPerCycle: number;
  cycleResetAt: string;
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
  const [totalUnits, setTotalUnits] = useState<number | null>(null);
  const [quota, setQuota] = useState<QuotaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dongFilter, setDongFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [pdfMessage, setPdfMessage] = useState("");
  const [quotaExhausted, setQuotaExhausted] = useState(false);

  const loadQuota = async () => {
    const response = await fetch("/api/apt-manager/subscription", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { quota?: QuotaSummary };
    if (data.quota) setQuota(data.quota);
  };

  useEffect(() => {
    (async () => {
      try {
        const [inspRes, meRes] = await Promise.all([
          fetch("/api/apt-manager/unit-inspections", { cache: "no-store" }),
          fetch("/api/apt-manager/me", { cache: "no-store" })
        ]);
        const inspData = (await inspRes.json()) as { inspections?: UnitInspection[] };
        const meData = (await meRes.json()) as { apartment?: { totalUnits: number | null } | null };
        if (inspRes.ok) setInspections(inspData.inspections ?? []);
        if (meRes.ok) setTotalUnits(meData.apartment?.totalUnits ?? null);
        await loadQuota();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** 공개 pdf_url을 직접 열지 않고 게이트 라우트를 거쳐 단기 서명 URL을 받아 연다. */
  const openPdf = async (inspectionId: string) => {
    setPdfBusyId(inspectionId);
    setPdfMessage("");
    setQuotaExhausted(false);
    try {
      const response = await fetch(`/api/apt-manager/unit-inspections/${inspectionId}/pdf`, { cache: "no-store" });
      const data = (await response.json()) as { url?: string; message?: string };
      if (response.status === 402) {
        setQuotaExhausted(true);
        setPdfMessage(data.message ?? "무료 다운로드를 모두 사용했습니다.");
        return;
      }
      if (!response.ok || !data.url) {
        setPdfMessage(data.message ?? "PDF를 여는 데 실패했습니다.");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
      await loadQuota();
    } catch {
      setPdfMessage("네트워크 오류로 PDF를 열지 못했습니다.");
    } finally {
      setPdfBusyId(null);
    }
  };

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

  const bulkDownload = async () => {
    setBulkDownloading(true);
    setBulkMessage("");
    setQuotaExhausted(false);
    try {
      const params = new URLSearchParams();
      if (dongFilter !== "전체") params.set("dong", dongFilter);
      const response = await fetch(`/api/apt-manager/unit-inspections/bulk-pdf?${params.toString()}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        if (response.status === 402) setQuotaExhausted(true);
        setBulkMessage(data.message ?? "일괄 다운로드에 실패했습니다.");
        return;
      }
      const skipped = Number(response.headers.get("X-Skipped-Count") ?? "0");
      if (skipped > 0) {
        setQuotaExhausted(true);
        setBulkMessage(`무료 한도를 넘어 ${skipped}건은 zip에서 제외했어요. 구독하시면 전부 받으실 수 있어요.`);
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
      await loadQuota();
    } catch {
      setBulkMessage("네트워크 오류로 일괄 다운로드에 실패했습니다.");
    } finally {
      setBulkDownloading(false);
    }
  };

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

      {quota ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[13px] font-semibold text-slate-600">
            {quota.subscribed ? (
              <>
                점검표 PDF <span className="font-bold text-dk-green">무제한</span> 이용중
              </>
            ) : (
              <>
                이번 주기 무료 다운로드{" "}
                <span className={`font-bold ${quota.remainingFree > 0 ? "text-dk-blue" : "text-dk-red"}`}>
                  {quota.remainingFree}
                </span>
                <span className="text-slate-400"> / {quota.freeQuotaPerCycle}건 남음</span>
              </>
            )}
          </p>
          {quota.subscribed ? null : (
            <Link href="/apt-manager/subscribe" className="shrink-0 text-xs font-bold text-dk-blue underline">
              구독하기
            </Link>
          )}
        </div>
      ) : null}

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

      <button
        type="button"
        disabled={bulkDownloading}
        onClick={() => void bulkDownload()}
        className="w-full rounded-xl border border-dk-blue py-2.5 text-sm font-bold text-dk-blue disabled:opacity-50"
      >
        {bulkDownloading
          ? "압축 중..."
          : dongFilter === "전체"
            ? "📦 전체 점검표 PDF 일괄 다운로드(zip)"
            : `📦 ${dongFilter}동 점검표 PDF 일괄 다운로드(zip)`}
      </button>
      {bulkMessage ? <p className="text-center text-xs text-rose-600">{bulkMessage}</p> : null}
      {pdfMessage ? <p className="text-center text-xs text-rose-600">{pdfMessage}</p> : null}
      {quotaExhausted ? (
        <Link
          href="/apt-manager/subscribe"
          className="block rounded-xl bg-dk-blue py-2.5 text-center text-sm font-bold text-white"
        >
          구독하고 PDF 무제한으로 받기
        </Link>
      ) : null}

      {filteredGroups.length === 0 ? (
        <EmptyState icon="📋" title="아직 점검 기록이 없어요" description="점검입력 탭에서 첫 점검을 등록해보세요." />
      ) : (
        <ul className="space-y-2">
          {filteredGroups.map((g) => {
            const badCount = g.latest.autoDiagnosis.length;
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
                    {g.latest.pdfUrl ? (
                      <button
                        type="button"
                        disabled={pdfBusyId === g.latest.id}
                        onClick={() => void openPdf(g.latest.id)}
                        className="inline-block rounded-xl bg-dk-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {pdfBusyId === g.latest.id ? "준비 중..." : "📄 점검표 PDF 다운로드"}
                      </button>
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
