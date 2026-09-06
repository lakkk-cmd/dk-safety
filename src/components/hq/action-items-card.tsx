"use client";

import { useCallback, useEffect, useState } from "react";

export type ActionItemRow = {
  id: string;
  report_id: string;
  content: string;
  done: boolean;
  done_at: string | null;
  note: string | null;
  created_at: string;
  report_date_label: string | null;
};

/** 경영진 회의가 뽑아낸 "대표님이 직접 처리해야 할 일" 체크리스트.
 *  panel(=/hq/report 전용 큰 카드)과 inline(=홈 요약용 가벼운 카드) 두 버전을 하나의 로직으로 공유한다. */
export default function ActionItemsCard({ variant = "panel" }: { variant?: "panel" | "inline" }) {
  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/agents/action-items", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ActionItemRow[] };
      setItems(data.items ?? []);
    } catch {
      // 조용히 무시 — 홈/보고서 둘 다 이 카드 하나 실패로 나머지 화면까지 막히면 안 됨
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleDone = async (item: ActionItemRow) => {
    const nextDone = !item.done;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, done: nextDone, done_at: nextDone ? new Date().toISOString() : null } : i)),
    );
    setSavingItemId(item.id);
    try {
      const res = await fetch("/api/admin/agents/action-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, done: nextDone }),
      });
      if (!res.ok) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
        setMessage("완료 처리 중 오류가 발생했습니다.");
      }
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      setMessage("완료 처리 중 오류가 발생했습니다.");
    } finally {
      setSavingItemId(null);
    }
  };

  const saveNote = async (item: ActionItemRow, note: string) => {
    if (note === (item.note ?? "")) return;
    setSavingItemId(item.id);
    try {
      const res = await fetch("/api/admin/agents/action-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, note }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, note: note.trim() || null } : i)));
      } else {
        setMessage("메모 저장 중 오류가 발생했습니다.");
      }
    } catch {
      setMessage("메모 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingItemId(null);
    }
  };

  if (loading) return variant === "panel" ? <p className="text-sm text-slate-500">할 일 목록 로딩 중…</p> : null;
  // 홈(inline)에서는 항목이 없으면 카드 자체를 숨겨 "나열식" 문제를 되풀이하지 않는다.
  if (variant === "inline" && items.length === 0) return null;

  const pendingCount = items.filter((i) => !i.done).length;

  return (
    <section className={variant === "panel" ? "rounded-2xl border-2 border-dk-blue bg-white p-6 shadow-sm" : "rounded-xl border border-slate-200 p-3"}>
      <div className="flex items-center justify-between">
        <h2 className={variant === "panel" ? "text-lg font-bold text-slate-900" : "text-sm font-bold text-slate-900"}>
          ✅ 대표님이 해야할 일
        </h2>
        {items.length > 0 ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">미완료 {pendingCount}건</span>
        ) : null}
      </div>
      {variant === "panel" ? (
        <p className="mt-1 text-sm text-slate-600">
          경영진 회의가 대표님이 직접 처리해야 할 항목만 뽑아 모은 목록입니다. 체크하면 다음 회의부터 같은 조언을 반복하지 않습니다.
        </p>
      ) : null}
      {message ? <p className="mt-2 text-xs font-semibold text-amber-700">{message}</p> : null}
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">아직 항목이 없습니다 — 다음 회의부터 자동으로 쌓입니다.</p>
      ) : (
        <ul className={variant === "panel" ? "mt-4 space-y-2.5" : "mt-2 space-y-2"}>
          {items.map((item) => (
            <ActionItemRowView
              key={item.id}
              item={item}
              saving={savingItemId === item.id}
              compact={variant === "inline"}
              onToggle={() => void toggleDone(item)}
              onSaveNote={(note) => void saveNote(item, note)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionItemRowView({
  item,
  saving,
  compact,
  onToggle,
  onSaveNote,
}: {
  item: ActionItemRow;
  saving: boolean;
  compact: boolean;
  onToggle: () => void;
  onSaveNote: (note: string) => void;
}) {
  const [noteDraft, setNoteDraft] = useState(item.note ?? "");

  return (
    <li className={`rounded-xl border px-4 py-3 ${item.done ? "border-slate-100 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={item.done}
          onChange={onToggle}
          disabled={saving}
          className="mt-1 h-4 w-4 shrink-0 accent-dk-blue"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${item.done ? "text-slate-400 line-through" : "text-slate-900"}`}>{item.content}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {item.report_date_label ?? ""}
            {item.done_at ? ` · ${new Date(item.done_at).toLocaleDateString("ko-KR")} 완료` : ""}
          </p>
        </div>
      </label>
      {!compact ? (
        <input
          type="text"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => onSaveNote(noteDraft)}
          placeholder="메모(부가설명·요청사항) — 입력 후 포커스 벗어나면 저장"
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:border-dk-blue focus:outline-none focus:ring-1 focus:ring-dk-blue"
        />
      ) : null}
    </li>
  );
}
