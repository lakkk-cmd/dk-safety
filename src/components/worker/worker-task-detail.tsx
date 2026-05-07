"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Reservation } from "@/lib/reservations-store";
import SignaturePad from "@/components/worker/signature-pad";

type TaskPayload = {
  id: string;
  status: string;
  reservation_id: string;
  site_photo_urls: string[];
  signature_png: string | null;
};

type Row = {
  task: TaskPayload;
  reservation: Reservation;
};

function taskStatusLabel(status: string) {
  if (status === "assigned") return "배정 완료";
  if (status === "in_progress") return "진행 중";
  if (status === "completed") return "작업 완료";
  return status;
}

export default function WorkerTaskDetail({ taskId }: { taskId: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [extraFee, setExtraFee] = useState("0");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/worker/tasks/${taskId}`, { cache: "no-store" });
      const data = (await response.json()) as Row & { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "불러오지 못했습니다.");
        setRow(null);
        return;
      }
      setRow({ task: data.task, reservation: data.reservation });
      setMessage(null);
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let closed = false;
    let poll: number | null = null;
    const startPoll = () => {
      if (poll !== null) return;
      poll = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void load();
      }, 8000);
    };
    const stopPoll = () => {
      if (poll !== null) {
        window.clearInterval(poll);
        poll = null;
      }
    };

    const es = new EventSource("/api/worker/tasks/stream");
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string;
          items?: Array<{ task: TaskPayload; reservation: Reservation }>;
        };
        if (data.type !== "tasks" || !Array.isArray(data.items)) return;
        const hit = data.items.find((row) => row.task.id === taskId);
        if (!hit) return;
        setRow((prev) => {
          if (!prev) {
            return {
              task: {
                id: hit.task.id,
                status: hit.task.status,
                site_photo_urls: hit.task.site_photo_urls,
                reservation_id: hit.reservation.id,
                signature_png: hit.task.signature_png ?? null
              },
              reservation: hit.reservation
            };
          }
          return {
            task: {
              ...prev.task,
              ...hit.task,
              reservation_id: prev.task.reservation_id,
              signature_png: prev.task.signature_png
            },
            reservation: hit.reservation
          };
        });
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      es.close();
      if (!closed) startPoll();
    };
    es.onopen = () => {
      stopPoll();
    };

    return () => {
      closed = true;
      stopPoll();
      es.close();
    };
  }, [load, taskId]);

  const start = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/worker/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "시작 처리에 실패했습니다.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const formData = new FormData();
      Array.from(files)
        .slice(0, 5)
        .forEach((file) => formData.append("photos", file));
      const response = await fetch(`/api/worker/tasks/${taskId}/photos`, { method: "POST", body: formData });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "사진 업로드에 실패했습니다.");
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!signature || signature.length < 80) {
      setMessage("완료 전 서명을 남겨주세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/worker/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          signaturePng: signature,
          extraFee: Math.max(0, Math.round(Number(extraFee || "0")))
        })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "완료 처리에 실패했습니다.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!row) {
    return (
      <div className="space-y-3">
        <Link href="/worker" className="text-sm font-semibold text-blue-700">
          목록으로
        </Link>
        {message ? <p className="text-sm text-rose-700">{message}</p> : <p className="text-sm text-slate-600">불러오는 중...</p>}
      </div>
    );
  }

  const { task, reservation } = row;

  return (
    <div className="space-y-4">
      <Link href="/worker" className="inline-flex text-sm font-semibold text-blue-700">
        목록으로
      </Link>

      <section className="warranty-band rounded-2xl p-4">
        <p className="warranty-badge">작업 지시서</p>
        <p className="mt-2 text-xs font-semibold text-slate-500">고객</p>
        <p className="text-lg font-black text-slate-900">{reservation.name}</p>
        <p className="mt-1 text-sm text-slate-700">{reservation.phone}</p>
        <p className="mt-2 text-sm text-slate-700">{reservation.address}</p>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p>
            <span className="font-semibold text-slate-900">희망일시</span> {reservation.preferredDate}{" "}
            {reservation.preferredTime}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-900">서비스</span> {reservation.serviceType}
          </p>
          <p className="mt-2 whitespace-pre-wrap">
            <span className="font-semibold text-slate-900">요청사항</span>
            <br />
            {reservation.detail}
          </p>
          {reservation.imageUrls.length > 0 ? (
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="font-semibold text-slate-900">접수 시 첨부 사진</p>
              <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {reservation.imageUrls.map((url, idx) => (
                  <li key={`${url}-${idx}`} className="overflow-hidden rounded-lg border border-slate-200">
                    <a href={url} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`접수 첨부 ${idx + 1}`} className="h-20 w-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {message ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p> : null}

      <section className="rounded-2xl border border-[#d6deec] bg-white p-4 shadow-[0_12px_24px_rgba(11,28,58,0.12)]">
        <h2 className="text-sm font-black text-slate-900">작업 진행</h2>
        <p className="mt-1 text-xs text-slate-600">상태: {taskStatusLabel(task.status)}</p>
        {reservation.orderTotalFinalFee != null ? (
          <p className="mt-1 text-xs font-semibold text-emerald-700">
            최종 정산: {reservation.orderTotalFinalFee.toLocaleString("ko-KR")}원 · 최종결제:{" "}
            {reservation.orderFinalPaymentStatus ?? "PENDING"}
          </p>
        ) : null}
        {reservation.orderWarrantyIssuedAt ? (
          <p className="mt-1 text-[11px] text-emerald-700">
            보증서 발급시각: {new Date(reservation.orderWarrantyIssuedAt).toLocaleString("ko-KR")}
          </p>
        ) : null}

        {task.status === "assigned" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void start()}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-dk-navy to-dk-blue py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            작업 시작
          </button>
        ) : null}

        {task.status === "in_progress" ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-800">현장 사진</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="mt-2 block w-full text-xs"
                onChange={(e) => void uploadPhotos(e.target.files)}
              />
              {task.site_photo_urls.length > 0 ? (
                <ul className="mt-2 grid grid-cols-3 gap-2">
                  {task.site_photo_urls.map((url, idx) => (
                    <li key={`${url}-${idx}`} className="overflow-hidden rounded-lg border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`현장 ${idx + 1}`} className="h-20 w-full object-cover" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-500">사진은 선택이지만 권장합니다.</p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-800">완료 서명</p>
              <div className="mt-2">
                <SignaturePad onChange={setSignature} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-800">현장 추가 비용(원)</p>
              <input
                type="number"
                min={0}
                value={extraFee}
                onChange={(e) => setExtraFee(e.target.value.replaceAll(/[^0-9]/g, "") || "0")}
                className="soft-input mt-2 w-full text-sm"
              />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void complete()}
              className="w-full rounded-xl bg-gradient-to-r from-dk-gold to-dk-blue py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              작업 완료
            </button>
          </div>
        ) : null}

        {task.status === "completed" ? (
          <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">이 작업은 완료되었습니다.</div>
        ) : null}
      </section>
    </div>
  );
}
