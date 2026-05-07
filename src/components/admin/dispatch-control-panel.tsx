"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type DispatchRow = {
  orderId: string;
  reservationId: string | null;
  apartmentName: string;
  dong: string;
  ho: string;
  dispatchStatus: string;
  taskStatus: string | null;
  assignedWorkerName: string | null;
};

type WorkerOption = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
};

function taskStatusLabel(task: string | null, dispatch: string): { text: string; className: string } {
  if (task === "completed") {
    return { text: "작업 완료", className: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100" };
  }
  if (task === "in_progress") {
    return { text: "현장 작업중", className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" };
  }
  if (task === "assigned") {
    return { text: "기사 배정됨", className: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" };
  }
  const d = (dispatch ?? "").toUpperCase();
  if (d === "ASSIGNED") {
    return { text: "배정 완료", className: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" };
  }
  if (d === "IN_PROGRESS") {
    return { text: "진행중", className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" };
  }
  if (d === "DONE") {
    return { text: "처리 완료", className: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100" };
  }
  if (d === "READY" || d === "BLOCKED" || d === "IDLE" || d === "ACTIVE") {
    return { text: "배정 대기", className: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100" };
  }
  return {
    text: dispatch || "상태 미확인",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
  };
}

export default function DispatchControlPanel({
  rows,
  workers
}: {
  rows: DispatchRow[];
  workers: WorkerOption[];
}) {
  const [items, setItems] = useState(rows);
  const [selectedWorker, setSelectedWorker] = useState<Record<string, string>>({});
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  const activeWorkers = useMemo(() => workers.filter((w) => w.active), [workers]);

  const assign = async (row: DispatchRow) => {
    if (!row.reservationId) {
      setMessage("연결된 예약이 없어 배정할 수 없습니다.");
      return;
    }
    const workerId = selectedWorker[row.orderId] ?? "";
    if (!workerId) {
      setMessage("배정할 기사를 선택해 주세요.");
      return;
    }
    setLoadingOrderId(row.orderId);
    setMessage("");
    try {
      const response = await fetch("/api/admin/tasks/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: row.reservationId,
          workerId,
          orderId: row.orderId
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        reservation?: { taskStatus?: string; assignedWorkerName?: string };
      };
      if (!response.ok) {
        throw new Error(data.message ?? "배정 실패");
      }
      const worker = workers.find((w) => w.id === workerId);
      setItems((prev) =>
        prev.map((item) =>
          item.orderId === row.orderId
            ? {
                ...item,
                dispatchStatus: "ASSIGNED",
                taskStatus: data.reservation?.taskStatus ?? "assigned",
                assignedWorkerName: data.reservation?.assignedWorkerName ?? worker?.name ?? item.assignedWorkerName
              }
            : item
        )
      );
      setMessage("기사 배정이 완료되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "배정 실패");
    } finally {
      setLoadingOrderId(null);
    }
  };

  const unassign = async (row: DispatchRow) => {
    if (!row.reservationId) {
      setMessage("연결된 예약이 없어 배정 해제할 수 없습니다.");
      return;
    }
    setLoadingOrderId(row.orderId);
    setMessage("");
    try {
      const response = await fetch("/api/admin/tasks/unassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: row.reservationId })
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; reservation?: { taskStatus?: string } };
      if (!response.ok) {
        throw new Error(data.message ?? "배정 해제 실패");
      }
      setItems((prev) =>
        prev.map((item) =>
          item.orderId === row.orderId
            ? {
                ...item,
                dispatchStatus: "READY",
                taskStatus: data.reservation?.taskStatus ?? null,
                assignedWorkerName: null
              }
            : item
        )
      );
      setMessage("배정이 해제되었습니다. 다른 기사로 재배정할 수 있습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "배정 해제 실패");
    } finally {
      setLoadingOrderId(null);
    }
  };

  return (
    <div className="space-y-3">
      {message ? (
        <div className="rounded-lg border border-slate-300 bg-slate-100 p-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {message}
        </div>
      ) : null}

      <ul className="space-y-3">
        {items.map((row) => {
          const status = taskStatusLabel(row.taskStatus, row.dispatchStatus);
          return (
            <li
              key={row.orderId}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1">
                    <p className="break-keep text-base font-bold leading-snug text-slate-900 dark:text-slate-100">
                      {row.apartmentName}
                    </p>
                    <span className="inline-flex shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                      입금완료
                    </span>
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">동 / 호수</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                        {row.dong}-{row.ho}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">배정 상태</dt>
                      <dd className="mt-1">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}>{status.text}</span>
                      </dd>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-1">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">담당 기사</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">{row.assignedWorkerName ?? "—"}</dd>
                    </div>
                  </dl>
                </div>

                <div className="shrink-0 border-t border-slate-100 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 dark:border-slate-800">
                  <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">배정</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
                    <select
                      className="h-10 min-w-[200px] max-w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900"
                      value={selectedWorker[row.orderId] ?? ""}
                      onChange={(e) => setSelectedWorker((prev) => ({ ...prev, [row.orderId]: e.target.value }))}
                    >
                      <option value="">기사 선택</option>
                      {activeWorkers.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.name} ({worker.phone})
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={loadingOrderId === row.orderId || !row.reservationId} onClick={() => void assign(row)}>
                        {loadingOrderId === row.orderId ? "배정중..." : "배정"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loadingOrderId === row.orderId || !row.reservationId || !row.taskStatus}
                        onClick={() => void unassign(row)}
                      >
                        해제
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
          표시할 결제 완료 주문이 없습니다.
        </p>
      ) : null}
    </div>
  );
}
