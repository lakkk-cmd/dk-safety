"use client";

import { FormEvent, useState } from "react";

type ActivityLogEntry = {
  id: string;
  content: string;
  createdAt: string;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function ActivityLogPanel({
  customerId,
  initialEntries
}: {
  customerId: string;
  initialEntries: ActivityLogEntry[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/bomi/customers/${customerId}/activity-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      const data = (await response.json()) as { entry?: ActivityLogEntry; message?: string };
      if (!response.ok || !data.entry) {
        throw new Error(data.message || "기록 등록 실패");
      }
      setEntries((prev) => [data.entry as ActivityLogEntry, ...prev]);
      setContent("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "기록 등록 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="상담 내용, 영업활동 등을 기록하세요"
          className="soft-input w-full"
        />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading || !content.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
            {loading ? "등록 중..." : "기록 추가"}
          </button>
          {message ? <p className="text-sm text-rose-700">{message}</p> : null}
        </div>
      </form>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">아직 기록이 없습니다.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="border-l-2 border-slate-200 pl-3">
              <p className="text-xs text-slate-400">{formatDateTime(entry.createdAt)}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{entry.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
