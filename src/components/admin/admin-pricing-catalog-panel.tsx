"use client";

import { useEffect, useState } from "react";
import { formatPricingCatalogFee, type PricingCatalogLine } from "@/lib/pricing-catalog";

export default function AdminPricingCatalogPanel() {
  const [lines, setLines] = useState<PricingCatalogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<PricingCatalogLine | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/pricing-catalog", { cache: "no-store" });
      const data = (await response.json()) as { lines?: PricingCatalogLine[]; message?: string };
      if (!response.ok) {
        throw new Error(data.message || "불러오기 실패");
      }
      setLines(data.lines ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startEdit = (row: PricingCatalogLine) => {
    setEditingKey(row.key);
    setDraft({ ...row });
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraft(null);
  };

  const saveDraft = async () => {
    if (!draft || editingKey === null) return;
    const title = draft.title.trim();
    if (!title) {
      setMessage("항목명을 입력해 주세요.");
      return;
    }
    let amount: number | null = draft.amount;
    if (draft.key === "base_dispatch") {
      const n = Number(draft.amount ?? 0);
      if (!Number.isFinite(n) || n < 50000) {
        setMessage("기본 출장비는 50,000원 이상이어야 합니다.");
        return;
      }
      amount = Math.round(n);
    } else if (amount !== null) {
      const n = Number(amount);
      amount = Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
    }

    const nextLines = lines.map((line) =>
      line.key === editingKey
        ? {
            ...line,
            title,
            amount,
            detail: draft.detail.trim()
          }
        : line
    );

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/pricing-catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: nextLines })
      });
      const data = (await response.json()) as { lines?: PricingCatalogLine[]; message?: string };
      if (!response.ok) {
        throw new Error(data.message || "저장 실패");
      }
      setLines(data.lines ?? nextLines);
      setEditingKey(null);
      setDraft(null);
      setMessage("저장되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const addRow = () => {
    const key = `custom_${Date.now()}`;
    const newLine: PricingCatalogLine = {
      key,
      title: "새 항목",
      amount: 0,
      detail: ""
    };
    setLines((prev) => [...prev, newLine]);
    setEditingKey(key);
    setDraft(newLine);
    setMessage(null);
  };

  const removeRow = async (key: string) => {
    if (key === "base_dispatch") return;
    if (!window.confirm("이 항목을 요금/단가표에서 삭제할까요?")) return;
    const nextLines = lines.filter((l) => l.key !== key);
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/pricing-catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: nextLines })
      });
      const data = (await response.json()) as { lines?: PricingCatalogLine[]; message?: string };
      if (!response.ok) {
        throw new Error(data.message || "삭제 실패");
      }
      setLines(data.lines ?? nextLines);
      if (editingKey === key) cancelEdit();
      setMessage("삭제되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제 실패");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">요금/단가표를 불러오는 중…</p>;
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
            message.includes("실패") || message.includes("필요") || message.includes("이상")
              ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
          }`}
        >
          {message}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <tr>
              <th className="px-4 py-3">항목</th>
              <th className="px-4 py-3">금액</th>
              <th className="hidden px-4 py-3 md:table-cell">비고</th>
              <th className="px-4 py-3 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row) => {
              const isEditing = editingKey === row.key && draft;
              return (
                <tr key={row.key} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-3 align-top font-semibold text-slate-900 dark:text-slate-100">
                    {isEditing && draft ? (
                      <input
                        className="soft-input w-full min-w-[140px] text-sm dark:border-slate-600 dark:bg-slate-900"
                        value={draft.title}
                        onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                        disabled={saving}
                      />
                    ) : (
                      row.title
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-800 dark:text-slate-200">
                    {isEditing && draft ? (
                      <div className="flex flex-col gap-2">
                        {draft.key !== "base_dispatch" ? (
                          <>
                            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                              <input
                                type="checkbox"
                                checked={draft.amount === null}
                                onChange={(e) =>
                                  setDraft((d) =>
                                    d ? { ...d, amount: e.target.checked ? null : (d.amount ?? 0) } : d
                                  )
                                }
                                disabled={saving}
                              />
                              변동 요금(금액 미고정)
                            </label>
                            {draft.amount !== null ? (
                              <input
                                type="number"
                                min={0}
                                step={1000}
                                className="soft-input w-full max-w-[11rem] font-mono text-sm dark:border-slate-600 dark:bg-slate-900"
                                value={draft.amount ?? 0}
                                onChange={(e) =>
                                  setDraft((d) =>
                                    d ? { ...d, amount: Math.round(Number(e.target.value || 0)) } : d
                                  )
                                }
                                disabled={saving}
                              />
                            ) : (
                              <span className="text-xs text-slate-500">현장·견적 후 안내</span>
                            )}
                          </>
                        ) : (
                          <input
                            type="number"
                            min={50000}
                            step={1000}
                            className="soft-input w-full max-w-[11rem] font-mono text-sm dark:border-slate-600 dark:bg-slate-900"
                            value={draft.amount ?? 50000}
                            onChange={(e) =>
                              setDraft((d) =>
                                d ? { ...d, amount: Math.round(Number(e.target.value || 0)) } : d
                              )
                            }
                            disabled={saving}
                          />
                        )}
                      </div>
                    ) : (
                      formatPricingCatalogFee(row.amount)
                    )}
                  </td>
                  <td className="hidden px-4 py-3 align-top text-slate-600 dark:text-slate-400 md:table-cell">
                    {isEditing && draft ? (
                      <textarea
                        className="soft-input min-h-[4rem] w-full max-w-md text-sm dark:border-slate-600 dark:bg-slate-900"
                        value={draft.detail}
                        onChange={(e) => setDraft((d) => (d ? { ...d, detail: e.target.value } : d))}
                        disabled={saving}
                      />
                    ) : (
                      <span className="text-xs leading-relaxed">{row.detail}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    {isEditing ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveDraft()}
                          className="rounded-lg bg-[#0b1c3a] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
                        >
                          {saving ? "저장…" : "저장"}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={cancelEdit}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded-lg border border-primary px-3 py-1.5 text-xs font-bold text-primary"
                        >
                          수정
                        </button>
                        {row.key !== "base_dispatch" ? (
                          <button
                            type="button"
                            onClick={() => void removeRow(row.key)}
                            disabled={saving}
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:text-rose-300"
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          disabled={saving || editingKey !== null}
          className="rounded-xl border border-dashed border-slate-400 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50 dark:border-slate-500 dark:text-slate-200"
        >
          + 항목 추가
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          기본 출장비 금액은「기본 출장비 설정」과 동일한 값으로 저장됩니다.
        </p>
      </div>
    </div>
  );
}
