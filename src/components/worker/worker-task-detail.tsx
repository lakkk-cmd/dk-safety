"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Reservation } from "@/lib/reservations-store";
import SignaturePad from "@/components/worker/signature-pad";
import { downscaleImageFiles } from "@/lib/downscale-image";

type TaskPayload = {
  id: string;
  status: string;
  reservation_id: string;
  site_photo_urls: string[];
  signature_png: string | null;
  accepted_at: string | null;
};

const DECLINE_REASON_PRESETS = ["개인사정", "차량고장", "일정중복", "건강문제"];
const UPGRADE_REASON_PRESETS = ["배선/회로 문제 발견", "벽체 개방 필요", "1시간 초과 예상", "기타"];
const SIMPLE_SWAP_SERVICE_TYPE = "단순기구교체";
const CUSTOM_LABOR_TIER_ID = "__custom__";

type MaterialCatalogItem = { id: string; name: string; unit_price: number };
type LaborTierCatalogItem = { id: string; label: string; max_minutes: number; amount: number };

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

function statusBadgeClass(status: string) {
  if (status === "in_progress") return "bg-amber-100 text-amber-900";
  if (status === "completed") return "bg-emerald-100 text-emerald-800";
  return "bg-blue-100 text-blue-800";
}

export default function WorkerTaskDetail({ taskId }: { taskId: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [showCompletePanel, setShowCompletePanel] = useState(false);
  const [catalogMaterials, setCatalogMaterials] = useState<MaterialCatalogItem[]>([]);
  const [catalogLaborTiers, setCatalogLaborTiers] = useState<LaborTierCatalogItem[]>([]);
  const [materialQtys, setMaterialQtys] = useState<Record<string, number>>({});
  const [selectedLaborTierId, setSelectedLaborTierId] = useState<string | null>(null);
  const [customLaborAmount, setCustomLaborAmount] = useState("0");
  const [customLaborReason, setCustomLaborReason] = useState("");
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");
  const cameraFileRef = useRef<HTMLInputElement | null>(null);
  const galleryFileRef = useRef<HTMLInputElement | null>(null);

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
    if (row?.task.status !== "in_progress" || catalogMaterials.length > 0 || catalogLaborTiers.length > 0) return;
    void (async () => {
      try {
        const response = await fetch("/api/worker/catalogs", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { materials?: MaterialCatalogItem[]; laborTiers?: LaborTierCatalogItem[] };
        setCatalogMaterials(data.materials ?? []);
        setCatalogLaborTiers(data.laborTiers ?? []);
      } catch {
        // ignore — 현장 정산 입력은 카탈로그 없이도 진행 가능(3시간 초과 직접입력으로 대체)
      }
    })();
  }, [row?.task.status, catalogMaterials.length, catalogLaborTiers.length]);

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
                signature_png: hit.task.signature_png ?? null,
                accepted_at: hit.task.accepted_at ?? null
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

  const accept = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/worker/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "수락 처리에 실패했습니다.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (declineReason.trim().length < 2) {
      setMessage("거절 사유를 선택하거나 2자 이상 입력해주세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/worker/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline", reason: declineReason.trim() })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "거절 처리에 실패했습니다.");
        return;
      }
      setDeclineModalOpen(false);
      setMessage(data.message ?? "배정을 거절했습니다.");
      setRow(null);
    } finally {
      setBusy(false);
    }
  };

  const upgrade = async () => {
    if (upgradeReason.trim().length < 2) {
      setMessage("업그레이드 사유를 선택하거나 2자 이상 입력해주세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/worker/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upgrade", reason: upgradeReason.trim() })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "업그레이드 처리에 실패했습니다.");
        return;
      }
      setUpgradeModalOpen(false);
      setMessage(data.message ?? "등급 업그레이드가 기록되었습니다.");
      await load();
    } finally {
      setBusy(false);
    }
  };

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
      const selected = Array.from(files).slice(0, 5);
      const downscaled = await downscaleImageFiles(selected);
      const formData = new FormData();
      downscaled.forEach((file) => formData.append("photos", file));
      const response = await fetch(`/api/worker/tasks/${taskId}/photos`, { method: "POST", body: formData });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "사진 업로드에 실패했습니다.");
        return;
      }
      if (cameraFileRef.current) cameraFileRef.current.value = "";
      if (galleryFileRef.current) galleryFileRef.current.value = "";
      await load();
    } finally {
      setBusy(false);
    }
  };

  const selectedMaterials = catalogMaterials
    .filter((m) => (materialQtys[m.id] ?? 0) > 0)
    .map((m) => ({ id: m.id, name: m.name, qty: materialQtys[m.id] ?? 0, unitPrice: m.unit_price }));
  const materialsTotal = selectedMaterials.reduce((sum, m) => sum + m.qty * m.unitPrice, 0);
  const selectedTier = catalogLaborTiers.find((t) => t.id === selectedLaborTierId) ?? null;
  const isCustomLaborTier = selectedLaborTierId === CUSTOM_LABOR_TIER_ID;
  const laborAmount = isCustomLaborTier ? Math.max(0, Math.round(Number(customLaborAmount || "0"))) : (selectedTier?.amount ?? 0);
  const laborTierPayload =
    isCustomLaborTier && laborAmount > 0
      ? { label: `3시간 초과${customLaborReason.trim() ? ` (${customLaborReason.trim()})` : " (기사 재량)"}`, amount: laborAmount }
      : selectedTier
        ? { label: selectedTier.label, amount: selectedTier.amount }
        : null;
  const computedExtraFee = materialsTotal + laborAmount;

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
          extraFee: computedExtraFee,
          materials: selectedMaterials,
          laborTier: laborTierPayload
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
        <div className="mt-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(task.status)}`}>{taskStatusLabel(task.status)}</span>
        </div>
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

        {task.status === "assigned" && !task.accepted_at ? (
          <div className="mt-4 space-y-2">
            <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
              새 배정입니다. 방문 가능 여부를 확인해주세요.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void accept()}
                className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                수락
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDeclineReason("");
                  setDeclineModalOpen(true);
                }}
                className="rounded-xl border-2 border-rose-300 bg-rose-50 py-3 text-sm font-bold text-rose-700 disabled:opacity-60"
              >
                거절
              </button>
            </div>
          </div>
        ) : null}

        {task.status === "assigned" && task.accepted_at ? (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void start()}
              className="w-full rounded-xl bg-gradient-to-r from-dk-navy to-dk-blue py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              작업 시작
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDeclineReason("");
                setDeclineModalOpen(true);
              }}
              className="w-full rounded-xl border border-rose-200 py-2 text-xs font-bold text-rose-600 disabled:opacity-60"
            >
              현장 방문이 어려운 사정이 생겼나요? 배정 거절하기
            </button>
          </div>
        ) : null}

        {task.status === "in_progress" && reservation.serviceType === SIMPLE_SWAP_SERVICE_TYPE ? (
          <div className="mt-4">
            {reservation.upgradedAt ? (
              <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">
                🔺 등급 업그레이드됨 · 사유: {reservation.upgradeReason}
                <br />
                <span className="font-semibold">
                  아래 작업완료 처리에서 &quot;작업비 난이도&quot;를 선택해주세요.
                </span>
              </p>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setUpgradeReason("");
                  setUpgradeModalOpen(true);
                }}
                className="w-full rounded-xl border-2 border-amber-300 bg-amber-50 py-2.5 text-xs font-bold text-amber-900 disabled:opacity-60"
              >
                🔺 더 큰 문제 발견 — 등급 업그레이드
              </button>
            )}
          </div>
        ) : null}

        {task.status === "in_progress" ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-800">현장 사진</p>
              <input
                ref={cameraFileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => void uploadPhotos(e.target.files)}
              />
              <input
                ref={galleryFileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => void uploadPhotos(e.target.files)}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => cameraFileRef.current?.click()}
                  className="rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 disabled:opacity-60"
                >
                  📷 사진 촬영
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => galleryFileRef.current?.click()}
                  className="rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 disabled:opacity-60"
                >
                  🖼️ 사진 선택
                </button>
              </div>
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

            <button
              type="button"
              onClick={() => setShowCompletePanel((prev) => !prev)}
              className="w-full rounded-xl border border-dk-gold bg-amber-50 py-3 text-sm font-bold text-amber-900"
            >
              작업완료 처리
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${showCompletePanel ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0"}`}>
              <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div>
                  <p className="text-xs font-semibold text-slate-800">재료비 (해당 품목 수량 입력)</p>
                  {catalogMaterials.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-500">등록된 재료 카탈로그가 없습니다.</p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {catalogMaterials.map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5">
                          <span className="text-xs font-semibold text-slate-800">
                            {m.name} <span className="text-slate-500">({m.unit_price.toLocaleString()}원)</span>
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={materialQtys[m.id] ?? 0}
                            onChange={(e) => {
                              const qty = Math.max(0, Math.round(Number(e.target.value.replaceAll(/[^0-9]/g, "") || "0")));
                              setMaterialQtys((prev) => ({ ...prev, [m.id]: qty }));
                            }}
                            className="soft-input h-9 w-16 text-center text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-800">작업비 난이도 (해당 없으면 미선택)</p>
                  <div className="mt-2 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedLaborTierId(null)}
                      className={`w-full rounded-lg border-2 px-2.5 py-2 text-left text-xs font-bold ${
                        selectedLaborTierId === null ? "border-slate-400 bg-white" : "border-slate-200 bg-white/60 text-slate-600"
                      }`}
                    >
                      작업비 없음 (재료비만)
                    </button>
                    {catalogLaborTiers.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedLaborTierId(t.id)}
                        className={`w-full rounded-lg border-2 px-2.5 py-2 text-left text-xs font-bold ${
                          selectedLaborTierId === t.id ? "border-dk-gold bg-amber-100 text-amber-900" : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {t.label} — {t.amount.toLocaleString()}원
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectedLaborTierId(CUSTOM_LABOR_TIER_ID)}
                      className={`w-full rounded-lg border-2 px-2.5 py-2 text-left text-xs font-bold ${
                        isCustomLaborTier ? "border-dk-gold bg-amber-100 text-amber-900" : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      3시간 초과 (기사 재량 · 직접 입력)
                    </button>
                    {isCustomLaborTier ? (
                      <div className="space-y-1.5 rounded-lg bg-white p-2">
                        <input
                          type="text"
                          value={customLaborReason}
                          onChange={(e) => setCustomLaborReason(e.target.value)}
                          placeholder="사유 (예: 배선 전면 교체)"
                          className="soft-input w-full text-xs"
                        />
                        <input
                          type="number"
                          min={0}
                          value={customLaborAmount}
                          onChange={(e) => setCustomLaborAmount(e.target.value.replaceAll(/[^0-9]/g, "") || "0")}
                          placeholder="작업비(원)"
                          className="soft-input w-full text-xs"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <p className="text-sm font-bold text-slate-800">
                  최종 예상: {(reservation.baseFee + computedExtraFee).toLocaleString()}원
                  <span className="ml-1 font-normal text-slate-500">
                    (출장비 {reservation.baseFee.toLocaleString()} + 현장 비용 {computedExtraFee.toLocaleString()})
                  </span>
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void complete()}
                  className="w-full rounded-xl bg-gradient-to-r from-dk-gold to-dk-blue py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  작업 완료 제출
                </button>
                <p className="text-xs text-slate-600">관리자 승인 후 보증서가 자동 발급됩니다.</p>
              </div>
            </div>
          </div>
        ) : null}

        {task.status === "completed" ? (
          <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">이 작업은 완료되었습니다.</div>
        ) : null}
      </section>

      {upgradeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <p className="text-sm font-bold text-slate-500">등급 업그레이드</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-900">더 큰 문제를 발견하셨나요?</h2>
            <p className="mt-1 text-xs text-slate-500">
              단순 기구교체 공임({reservation.baseFee.toLocaleString()}원)은 완료 시 작업비에서 자동 공제됩니다. 사유를
              선택해주세요.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {UPGRADE_REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setUpgradeReason(preset)}
                  className={`rounded-xl border-2 py-2.5 text-sm font-bold transition-colors ${
                    upgradeReason === preset ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-700"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              value={UPGRADE_REASON_PRESETS.includes(upgradeReason) ? "" : upgradeReason}
              onChange={(e) => setUpgradeReason(e.target.value)}
              placeholder="기타 사유 직접 입력"
              className="soft-input mt-2 w-full text-sm"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setUpgradeModalOpen(false)}
                className="h-12 rounded-xl border border-slate-300 text-sm font-bold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy || upgradeReason.trim().length < 2}
                onClick={() => void upgrade()}
                className="h-12 rounded-xl bg-amber-600 text-sm font-extrabold text-white disabled:opacity-50"
              >
                {busy ? "처리중..." : "업그레이드 확정"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {declineModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <p className="text-sm font-bold text-slate-500">배정 거절</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-900">거절 사유를 알려주세요</h2>
            <p className="mt-1 text-xs text-slate-500">거절하면 즉시 관리자에게 알림이 발송되고 다른 기사에게 재배정됩니다.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DECLINE_REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDeclineReason(preset)}
                  className={`rounded-xl border-2 py-2.5 text-sm font-bold transition-colors ${
                    declineReason === preset ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-700"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              value={DECLINE_REASON_PRESETS.includes(declineReason) ? "" : declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="기타 사유 직접 입력"
              className="soft-input mt-2 w-full text-sm"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeclineModalOpen(false)}
                className="h-12 rounded-xl border border-slate-300 text-sm font-bold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy || declineReason.trim().length < 2}
                onClick={() => void decline()}
                className="h-12 rounded-xl bg-rose-600 text-sm font-extrabold text-white disabled:opacity-50"
              >
                {busy ? "처리중..." : "거절 확정"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
