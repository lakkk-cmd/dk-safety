"use client";

import { useMemo, useState } from "react";
import type { ActivityLog } from "@/lib/activity-log";
import { ChatIcon } from "@/components/ui/icons";

type Props = {
  logs: ActivityLog[];
};

export default function AdminActivityPanel({ logs }: Props) {
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | ActivityLog["action"]>("all");
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesAction = actionFilter === "all" ? true : log.action === actionFilter;
      const matchesQuery =
        lowered.length === 0 ? true : `${log.message} ${log.reservationId}`.toLowerCase().includes(lowered);
      return matchesAction && matchesQuery;
    });
  }, [logs, query, actionFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <aside className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
            <span className="icon-dot h-6 w-6">
              <ChatIcon className="h-3.5 w-3.5" />
            </span>
            최근 활동 로그
          </h2>
          <p className="mt-1 text-sm text-slate-500">상태 변경, 메모 수정, 신규 접수 이력을 확인합니다.</p>
        </div>
        <a href="/api/admin/activity-logs/export" className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white">
          로그 CSV
        </a>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="메시지/예약ID 검색"
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs"
        />
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value as "all" | ActivityLog["action"]);
            setPage(1);
          }}
          className="rounded-md border border-slate-200 px-2 py-2 text-xs"
        >
          <option value="all">전체</option>
          <option value="reservation_created">신규접수</option>
          <option value="status_updated">상태변경</option>
          <option value="note_updated">메모변경</option>
          <option value="backup_restored">백업복원</option>
        </select>
      </div>

      <ul className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <li className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">기록된 활동이 없습니다.</li>
        ) : (
          paginated.map((log) => (
            <li key={log.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium text-slate-800">{log.message}</p>
              <p className="mt-1 text-xs text-slate-500">{new Date(log.createdAt).toLocaleString("ko-KR")}</p>
            </li>
          ))
        )}
      </ul>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          {page} / {totalPages} 페이지
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
            className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-50"
          >
            이전
          </button>
          <button
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-50"
          >
            다음
          </button>
        </div>
      </div>
    </aside>
  );
}
