"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export type ElectricalTipRow = {
  id: string;
  category: string;
  title: string;
  summary: string;
  content: string;
  image_url: string | null;
  service_type: string | null;
  is_published: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

type CategoryKey = "all" | "safety" | "saving" | "selfcheck" | "seasonal";

const FILTER_TABS: { key: CategoryKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "safety", label: "안전" },
  { key: "saving", label: "절약" },
  { key: "selfcheck", label: "자가점검" },
  { key: "seasonal", label: "계절별" }
];

const CATEGORY_LABEL: Record<string, string> = {
  safety: "안전",
  saving: "절약",
  selfcheck: "자가점검",
  seasonal: "계절별"
};

/** 없음(null) / VISIT / DIAGNOSIS / LEAKAGE / OUTLET / LIGHT */
const SERVICE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "없음(null)" },
  { value: "VISIT", label: "출장비(VISIT)" },
  { value: "DIAGNOSIS", label: "정밀안전진단(DIAGNOSIS)" },
  { value: "LEAKAGE", label: "누전점검(LEAKAGE)" },
  { value: "OUTLET", label: "콘센트교체(OUTLET)" },
  { value: "LIGHT", label: "전등교체(LIGHT)" }
];

const OPEN_CREATE_EVENT = "electrical-tips:open-create";

function emptyDraft(nextOrder: number): Omit<ElectricalTipRow, "id" | "created_at" | "updated_at"> {
  return {
    category: "safety",
    title: "",
    summary: "",
    content: "",
    image_url: null,
    service_type: null,
    is_published: false,
    display_order: nextOrder
  };
}

export default function AdminElectricalTipsPanel() {
  const [tips, setTips] = useState<ElectricalTipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryKey>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<ElectricalTipRow, "id" | "created_at" | "updated_at"> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/electrical-tips", { cache: "no-store" });
      const data = (await response.json()) as { tips?: ElectricalTipRow[]; message?: string };
      if (!response.ok) {
        throw new Error(data.message || "불러오기 실패");
      }
      setTips(data.tips ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nextDisplayOrder = useMemo(() => {
    if (!tips.length) return 0;
    return Math.max(...tips.map((t) => t.display_order ?? 0), -1) + 1;
  }, [tips]);

  const openNew = useCallback(() => {
    setEditingId(null);
    setDraft(emptyDraft(nextDisplayOrder));
    setSheetOpen(true);
    setMessage(null);
  }, [nextDisplayOrder]);

  useEffect(() => {
    const onOpenCreate = () => openNew();
    window.addEventListener(OPEN_CREATE_EVENT, onOpenCreate);
    return () => window.removeEventListener(OPEN_CREATE_EVENT, onOpenCreate);
  }, [openNew]);

  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const filtered = useMemo(() => {
    if (filter === "all") return tips;
    return tips.filter((t) => t.category === filter);
  }, [tips, filter]);

  const openEdit = (row: ElectricalTipRow) => {
    setEditingId(row.id);
    setDraft({
      category: row.category,
      title: row.title,
      summary: row.summary,
      content: row.content,
      image_url: row.image_url,
      service_type: row.service_type,
      is_published: row.is_published,
      display_order: row.display_order
    });
    setSheetOpen(true);
    setMessage(null);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setDraft(null);
    setEditingId(null);
  };

  const saveSheet = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    const summary = draft.summary.trim();
    const content = draft.content.trim();
    if (!title || !summary || !content) {
      setMessage("제목·요약·본문을 모두 입력해 주세요.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        category: draft.category,
        title,
        summary,
        content,
        service_type: draft.service_type?.trim() || null,
        display_order: draft.display_order,
        is_published: draft.is_published
      };
      if (editingId) {
        const response = await fetch(`/api/admin/electrical-tips/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = (await response.json()) as { tip?: ElectricalTipRow; message?: string };
        if (!response.ok) {
          throw new Error(data.message || "저장 실패");
        }
        if (data.tip) {
          setTips((prev) =>
            prev.map((t) => (t.id === data.tip!.id ? data.tip! : t)).sort((a, b) => a.display_order - b.display_order)
          );
        }
        setMessage("저장되었습니다.");
      } else {
        const response = await fetch("/api/admin/electrical-tips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = (await response.json()) as { tip?: ElectricalTipRow; message?: string };
        if (!response.ok) {
          throw new Error(data.message || "생성 실패");
        }
        if (data.tip) {
          setTips((prev) => [...prev, data.tip!].sort((a, b) => a.display_order - b.display_order));
        }
        setMessage("등록되었습니다.");
      }
      closeSheet();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (row: ElectricalTipRow) => {
    setSaving(true);
    setMessage(null);
    try {
      const next = !row.is_published;
      const response = await fetch(`/api/admin/electrical-tips/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: next })
      });
      const data = (await response.json()) as { tip?: ElectricalTipRow; message?: string };
      if (!response.ok) {
        throw new Error(data.message || "갱신 실패");
      }
      if (data.tip) {
        setTips((prev) => prev.map((t) => (t.id === row.id ? data.tip! : t)));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "갱신 실패");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: ElectricalTipRow) => {
    if (!window.confirm(`「${row.title}」을(를) 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/electrical-tips/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message || "삭제 실패");
      }
      setTips((prev) => prev.filter((t) => t.id !== row.id));
      setMessage("삭제되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제 실패");
    } finally {
      setSaving(false);
    }
  };

  /** 안전=빨강, 절약=초록, 자가점검=파랑, 계절별=주황 */
  const badgeClass = (cat: string) => {
    switch (cat) {
      case "safety":
        return "bg-red-100 text-red-900 border-red-300";
      case "saving":
        return "bg-emerald-100 text-emerald-900 border-emerald-300";
      case "selfcheck":
        return "bg-blue-100 text-blue-900 border-blue-300";
      case "seasonal":
        return "bg-orange-100 text-orange-900 border-orange-300";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">생활전기정보를 불러오는 중…</p>;
  }

  return (
    <div className="space-y-6 pb-8">
      {message ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
            message.includes("실패") || message.includes("필요") || message.includes("유효") || message.includes("오류")
              ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
          }`}
        >
          {message}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
              filter === tab.key
                ? "border-dk-navy bg-dk-navy text-white shadow-sm"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-400">
            표시할 콘텐츠가 없습니다. 필터를 바꾸거나 상단「새 콘텐츠 작성」을 눌러 보세요.
          </p>
        ) : (
          filtered.map((row) => (
            <article
              key={row.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeClass(row.category)}`}>
                  {CATEGORY_LABEL[row.category] ?? row.category}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={row.is_published ? "border-emerald-300 text-emerald-800" : "border-slate-300 text-slate-600"}
                  disabled={saving}
                  onClick={() => void togglePublished(row)}
                >
                  {row.is_published ? "발행 중" : "미발행"}
                </Button>
              </div>
              <h2 className="mt-3 text-lg font-black tracking-tight text-slate-900 dark:text-slate-50">{row.title}</h2>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{row.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <Button type="button" variant="outline" size="sm" onClick={() => openEdit(row)} disabled={saving}>
                  수정
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void remove(row)}
                  disabled={saving}
                  className="text-rose-700 hover:bg-rose-50"
                >
                  삭제
                </Button>
              </div>
            </article>
          ))
        )}
      </div>

      {sheetOpen && draft ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/40"
            aria-label="폼 닫기"
            onClick={() => !saving && closeSheet()}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-950"
            role="dialog"
            aria-modal="true"
          >
            <div className="mx-auto max-w-2xl px-5 pb-8 pt-5">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-50">{editingId ? "콘텐츠 수정" : "새 콘텐츠"}</h3>
                <button
                  type="button"
                  onClick={() => !saving && closeSheet()}
                  className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  disabled={saving}
                >
                  닫기
                </button>
              </div>
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">카테고리</label>
                  <select
                    className="soft-input w-full text-sm dark:border-slate-600 dark:bg-slate-900"
                    value={draft.category}
                    onChange={(e) => setDraft((d) => (d ? { ...d, category: e.target.value } : d))}
                    disabled={saving}
                  >
                    <option value="safety">안전</option>
                    <option value="saving">절약</option>
                    <option value="selfcheck">자가점검</option>
                    <option value="seasonal">계절별</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">제목</label>
                  <input
                    className="soft-input w-full text-sm dark:border-slate-600 dark:bg-slate-900"
                    value={draft.title}
                    onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">요약</label>
                  <textarea
                    className="soft-input min-h-[4.5rem] w-full resize-y text-sm dark:border-slate-600 dark:bg-slate-900"
                    value={draft.summary}
                    onChange={(e) => setDraft((d) => (d ? { ...d, summary: e.target.value } : d))}
                    disabled={saving}
                    rows={3}
                    placeholder="카드에 표시될 2줄 소개"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">본문</label>
                  <textarea
                    className="soft-input min-h-[12rem] w-full resize-y font-mono text-sm dark:border-slate-600 dark:bg-slate-900"
                    value={draft.content}
                    onChange={(e) => setDraft((d) => (d ? { ...d, content: e.target.value } : d))}
                    disabled={saving}
                    rows={12}
                    placeholder="마크다운 작성 가능"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">연결 서비스</label>
                  <select
                    className="soft-input w-full text-sm dark:border-slate-600 dark:bg-slate-900"
                    value={draft.service_type ?? ""}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, service_type: e.target.value === "" ? null : e.target.value } : d))
                    }
                    disabled={saving}
                  >
                    {SERVICE_OPTIONS.map((o) => (
                      <option key={o.value || "none"} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">노출 순서</label>
                  <input
                    type="number"
                    className="soft-input w-full text-sm dark:border-slate-600 dark:bg-slate-900"
                    value={draft.display_order}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              display_order: Number.isFinite(Number(e.target.value)) ? Math.round(Number(e.target.value)) : 0
                            }
                          : d
                      )
                    }
                    disabled={saving}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={draft.is_published}
                    onChange={(e) => setDraft((d) => (d ? { ...d, is_published: e.target.checked } : d))}
                    disabled={saving}
                    className="h-4 w-4 rounded border-slate-400"
                  />
                  발행
                </label>
              </div>
              <div className="mt-8 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => !saving && closeSheet()} disabled={saving}>
                  취소
                </Button>
                <Button type="button" onClick={() => void saveSheet()} disabled={saving}>
                  {saving ? "저장 중…" : "저장"}
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
