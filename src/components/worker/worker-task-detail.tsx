"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Reservation } from "@/lib/reservations-store";
import SignaturePad from "@/components/worker/signature-pad";
import InspectionSteps, { type InspectionInput } from "@/components/worker/inspection-steps";
import QuoteBuilder, {
  type LaborTierCatalogItem,
  type MaterialCatalogItem,
  type QuoteLaborTier,
  type QuoteMaterial,
  type QuoteValue
} from "@/components/worker/quote-builder";
import FieldReportPipelineButton from "@/components/worker/field-report-pipeline-button";
import { LoadingOverlay, type LoadingOverlayStep } from "@/components/ui/loading-overlay";
import { BigButton } from "@/components/ui/big-button";
import { downscaleImageFiles } from "@/lib/downscale-image";

type TaskPayload = {
  id: string;
  status: string;
  reservation_id: string;
  site_photo_urls: string[];
  signature_png: string | null;
  accepted_at: string | null;
  field_report_id: string | null;
  quote_materials: QuoteMaterial[] | null;
  quote_labor_tier: QuoteLaborTier;
  quote_amount: number | null;
  quoted_at: string | null;
  customer_approved_at: string | null;
};

type FieldReportSummary = {
  id: string;
  status: string;
  risk_level: string | null;
  pdf_resident_url: string | null;
  pdf_landlord_url: string | null;
  sent_at: string | null;
};

const DECLINE_REASON_PRESETS = ["개인사정", "차량고장", "일정중복", "건강문제"];
const UPGRADE_REASON_PRESETS = ["배선/회로 문제 발견", "벽체 개방 필요", "1시간 초과 예상", "기타"];
const SIMPLE_SWAP_SERVICE_TYPE = "단순기구교체";

type Row = {
  task: TaskPayload;
  fieldReport: FieldReportSummary | null;
  reservation: Reservation;
};

/** task 필드만으로 현재 어느 단계인지 파생 — 별도 step 컬럼 없이 새로고침에도 안전하게 복귀 */
function deriveStep(task: TaskPayload): number {
  if (task.status === "completed") return 6;
  if (task.status === "in_progress") return 4;
  if (!task.accepted_at) return 0;
  if (!task.field_report_id) return 1;
  if (!task.quoted_at) return 2;
  return 3;
}

export default function WorkerTaskDetail({ taskId }: { taskId: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [showCompletePanel, setShowCompletePanel] = useState(false);
  const [catalogMaterials, setCatalogMaterials] = useState<MaterialCatalogItem[]>([]);
  const [catalogLaborTiers, setCatalogLaborTiers] = useState<LaborTierCatalogItem[]>([]);
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");
  const cameraFileRef = useRef<HTMLInputElement | null>(null);
  const galleryFileRef = useRef<HTMLInputElement | null>(null);

  const [inspectionSubmitting, setInspectionSubmitting] = useState(false);
  const [pipelineSteps, setPipelineSteps] = useState<LoadingOverlayStep[] | null>(null);

  const [draftQuote, setDraftQuote] = useState<QuoteValue>({ materials: [], laborTier: null, total: 0 });
  const [approvalChecked, setApprovalChecked] = useState(false);

  const [completionQuote, setCompletionQuote] = useState<QuoteValue>({ materials: [], laborTier: null, total: 0 });
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/worker/tasks/${taskId}`, { cache: "no-store" });
      const data = (await response.json()) as Row & { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "불러오지 못했습니다.");
        setRow(null);
        return;
      }
      setRow({ task: data.task, fieldReport: data.fieldReport ?? null, reservation: data.reservation });
      setMessage(null);
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    }
  }, [taskId]);

  useEffect(() => {
    if (!row?.task.accepted_at || catalogMaterials.length > 0 || catalogLaborTiers.length > 0) return;
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
  }, [row?.task.accepted_at, catalogMaterials.length, catalogLaborTiers.length]);

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
          items?: Array<{ task: { id: string; status: string; site_photo_urls: string[]; accepted_at: string | null }; reservation: Reservation }>;
        };
        if (data.type !== "tasks" || !Array.isArray(data.items)) return;
        const hit = data.items.find((r) => r.task.id === taskId);
        if (!hit) return;
        setRow((prev) => {
          if (!prev) {
            return {
              task: {
                id: hit.task.id,
                status: hit.task.status,
                site_photo_urls: hit.task.site_photo_urls,
                reservation_id: hit.reservation.id,
                signature_png: null,
                accepted_at: hit.task.accepted_at ?? null,
                field_report_id: null,
                quote_materials: null,
                quote_labor_tier: null,
                quote_amount: null,
                quoted_at: null,
                customer_approved_at: null
              },
              fieldReport: null,
              reservation: hit.reservation
            };
          }
          return {
            task: { ...prev.task, ...hit.task, reservation_id: prev.task.reservation_id, signature_png: prev.task.signature_png },
            fieldReport: prev.fieldReport,
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

  const runInspectionPipeline = async (fieldReportId: string) => {
    const steps: LoadingOverlayStep[] = [
      { label: "AI 소견 생성 중...", status: "running" },
      { label: "PDF 리포트 생성 중...", status: "pending" },
      { label: "카카오 알림톡 발송 중...", status: "pending" }
    ];
    setPipelineSteps([...steps]);
    try {
      const opinionRes = await fetch("/api/field-report/generate-opinion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldReportId })
      });
      if (!opinionRes.ok) {
        steps[0] = { ...steps[0], status: "error" };
        setPipelineSteps([...steps]);
        return;
      }
      steps[0] = { ...steps[0], status: "done" };
      steps[1] = { ...steps[1], status: "running" };
      setPipelineSteps([...steps]);

      const pdfRes = await fetch("/api/field-report/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldReportId })
      });
      if (!pdfRes.ok) {
        steps[1] = { ...steps[1], status: "error" };
        setPipelineSteps([...steps]);
        return;
      }
      steps[1] = { ...steps[1], status: "done" };
      steps[2] = { ...steps[2], status: "running" };
      setPipelineSteps([...steps]);

      const sendRes = await fetch("/api/field-report/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldReportId })
      });
      if (!sendRes.ok) {
        steps[2] = { ...steps[2], status: "error" };
        setPipelineSteps([...steps]);
        return;
      }
      steps[2] = { ...steps[2], status: "done" };
      setPipelineSteps([...steps]);
    } catch {
      steps.forEach((s, i) => {
        if (s.status === "running") steps[i] = { ...s, status: "error" };
      });
      setPipelineSteps([...steps]);
    } finally {
      window.setTimeout(() => setPipelineSteps(null), 900);
    }
  };

  const submitInspection = async (input: InspectionInput) => {
    if (!row) return;
    setInspectionSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/worker/field-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: row.reservation.id,
          apartmentAddress: row.reservation.address,
          ...input,
          status: "submitted"
        })
      });
      const data = (await response.json()) as { report?: { id: string }; message?: string };
      if (!response.ok || !data.report) {
        setMessage(data.message ?? "점검 저장에 실패했습니다.");
        return;
      }
      await runInspectionPipeline(data.report.id);
      await load();
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setInspectionSubmitting(false);
    }
  };

  const submitQuote = async () => {
    if (!row) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/worker/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "quote",
          fieldReportId: row.task.field_report_id ?? row.fieldReport?.id ?? undefined,
          materials: draftQuote.materials,
          laborTier: draftQuote.laborTier
        })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "견적 저장에 실패했습니다.");
        return;
      }
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
          extraFee: completionQuote.total,
          materials: completionQuote.materials,
          laborTier: completionQuote.laborTier,
          adjustmentReason: adjustmentReason.trim() || undefined
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

  const { task, reservation, fieldReport } = row;
  const step = deriveStep(task);
  const canDecline = task.status === "assigned";

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

      {/* 0. 배정 확인 */}
      {step === 0 ? (
        <section className="rounded-2xl border border-[#d6deec] bg-white p-4 shadow-[0_12px_24px_rgba(11,28,58,0.12)]">
          <h2 className="text-sm font-black text-slate-900">배정 확인</h2>
          <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
            새 배정입니다. 방문 가능 여부를 확인해주세요.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
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
        </section>
      ) : null}

      {/* 1. 점검 */}
      {step === 1 ? (
        <section className="rounded-2xl border border-[#d6deec] bg-white p-4 shadow-[0_12px_24px_rgba(11,28,58,0.12)]">
          <h2 className="text-sm font-black text-slate-900">현장 점검</h2>
          <p className="mt-1 text-xs text-slate-500">분전반부터 순서대로 입력해주세요. 마지막 단계에서 진단 리포트가 자동으로 생성·발송됩니다.</p>
          <div className="mt-3">
            <InspectionSteps onSubmit={(input) => void submitInspection(input)} submitting={inspectionSubmitting} />
          </div>
        </section>
      ) : null}

      {/* 2. 비용 산출 */}
      {step === 2 ? (
        <section className="rounded-2xl border border-[#d6deec] bg-white p-4 shadow-[0_12px_24px_rgba(11,28,58,0.12)]">
          <h2 className="text-sm font-black text-slate-900">현장 견적 산출</h2>
          {fieldReport && fieldReport.status !== "completed" ? (
            <div className="mt-2">
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                진단 리포트 발송이 아직 끝나지 않았습니다. 아래에서 이어서 진행하거나, 견적부터 먼저 산출할 수 있습니다.
              </p>
              <div className="mt-2">
                <FieldReportPipelineButton fieldReportId={fieldReport.id} />
              </div>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">이상 부위와 재료·작업난이도를 골라 고객에게 안내할 예상 비용을 산출하세요.</p>
          <div className="mt-3">
            <QuoteBuilder catalogMaterials={catalogMaterials} catalogLaborTiers={catalogLaborTiers} onChange={setDraftQuote} />
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">
            예상금액: {(reservation.baseFee + draftQuote.total).toLocaleString()}원
            <span className="ml-1 font-normal text-slate-500">
              (출장비 {reservation.baseFee.toLocaleString()} + 현장 비용 {draftQuote.total.toLocaleString()})
            </span>
          </p>
          <BigButton className="mt-3" disabled={busy} onClick={() => void submitQuote()}>
            {busy ? "저장 중..." : "현장 견적 확정"}
          </BigButton>
          {canDecline ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDeclineReason("");
                setDeclineModalOpen(true);
              }}
              className="mt-2 w-full rounded-xl border border-rose-200 py-2 text-xs font-bold text-rose-600 disabled:opacity-60"
            >
              현장 방문이 어려운 사정이 생겼나요? 배정 거절하기
            </button>
          ) : null}
        </section>
      ) : null}

      {/* 3. 고객 승인 확인 */}
      {step === 3 ? (
        <section className="rounded-2xl border border-[#d6deec] bg-white p-4 shadow-[0_12px_24px_rgba(11,28,58,0.12)]">
          <h2 className="text-sm font-black text-slate-900">고객 승인 확인</h2>
          <p className="mt-3 text-2xl font-black text-dk-navy">
            {(reservation.baseFee + (task.quote_amount ?? 0)).toLocaleString()}원
          </p>
          <p className="text-xs text-slate-500">
            (출장비 {reservation.baseFee.toLocaleString()} + 현장 비용 {(task.quote_amount ?? 0).toLocaleString()})
          </p>
          <label className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={approvalChecked}
              onChange={(e) => setApprovalChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5"
            />
            고객에게 위 금액을 안내하고 구두로 승인받았습니다.
          </label>
          <BigButton className="mt-3" disabled={!approvalChecked || busy} onClick={() => void start()}>
            {busy ? "처리 중..." : "작업 시작"}
          </BigButton>
          {canDecline ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDeclineReason("");
                setDeclineModalOpen(true);
              }}
              className="mt-2 w-full rounded-xl border border-rose-200 py-2 text-xs font-bold text-rose-600 disabled:opacity-60"
            >
              현장 방문이 어려운 사정이 생겼나요? 배정 거절하기
            </button>
          ) : null}
        </section>
      ) : null}

      {/* 4~5. 현장 작업 + 완료 처리 */}
      {step === 4 ? (
        <section className="rounded-2xl border border-[#d6deec] bg-white p-4 shadow-[0_12px_24px_rgba(11,28,58,0.12)]">
          <h2 className="text-sm font-black text-slate-900">작업 진행</h2>
          <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">진행 중</span>
          {reservation.orderTotalFinalFee != null ? (
            <p className="mt-1 text-xs font-semibold text-emerald-700">
              최종 정산: {reservation.orderTotalFinalFee.toLocaleString("ko-KR")}원 · 최종결제:{" "}
              {reservation.orderFinalPaymentStatus ?? "PENDING"}
            </p>
          ) : null}

          {reservation.serviceType === SIMPLE_SWAP_SERVICE_TYPE ? (
            <div className="mt-4">
              {reservation.upgradedAt ? (
                <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">
                  🔺 등급 업그레이드됨 · 사유: {reservation.upgradeReason}
                  <br />
                  <span className="font-semibold">아래 작업완료 처리에서 &quot;작업비 난이도&quot;를 선택해주세요.</span>
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

          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-800">작업 후 사진</p>
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
                      <img src={url} alt={`작업 후 ${idx + 1}`} className="h-20 w-full object-cover" />
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
            <div className={`overflow-hidden transition-all duration-300 ${showCompletePanel ? "max-h-[1600px] opacity-100" : "max-h-0 opacity-0"}`}>
              <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                {task.quote_amount != null ? (
                  <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                    최초 견적: {task.quote_amount.toLocaleString()}원 (고객 구두승인 완료)
                  </p>
                ) : null}
                <QuoteBuilder
                  catalogMaterials={catalogMaterials}
                  catalogLaborTiers={catalogLaborTiers}
                  initialMaterials={task.quote_materials}
                  initialLaborTier={task.quote_labor_tier}
                  onChange={setCompletionQuote}
                />
                {task.quote_amount != null && completionQuote.total !== task.quote_amount ? (
                  <div>
                    <p className="text-xs font-bold text-amber-900">
                      최초 견적 {task.quote_amount.toLocaleString()}원 → 현재 산정{" "}
                      {completionQuote.total.toLocaleString()}원 (
                      {completionQuote.total > task.quote_amount ? "+" : ""}
                      {(completionQuote.total - task.quote_amount).toLocaleString()}원)
                    </p>
                    <input
                      value={adjustmentReason}
                      onChange={(e) => setAdjustmentReason(e.target.value)}
                      placeholder="조정 사유 (선택 — 예: 예상보다 빨리 종료)"
                      className="soft-input mt-1.5 w-full text-xs"
                    />
                  </div>
                ) : null}
                <p className="text-sm font-bold text-slate-800">
                  최종 예상: {(reservation.baseFee + completionQuote.total).toLocaleString()}원
                  <span className="ml-1 font-normal text-slate-500">
                    (출장비 {reservation.baseFee.toLocaleString()} + 현장 비용 {completionQuote.total.toLocaleString()})
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
        </section>
      ) : null}

      {/* 6. 완료 */}
      {step === 6 ? (
        <section className="rounded-2xl border border-[#d6deec] bg-white p-4 shadow-[0_12px_24px_rgba(11,28,58,0.12)]">
          <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">이 작업은 완료되었습니다.</div>
          {fieldReport?.pdf_resident_url || fieldReport?.pdf_landlord_url ? (
            <div className="mt-3 flex gap-2">
              {fieldReport.pdf_resident_url ? (
                <a
                  href={fieldReport.pdf_resident_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-xl border-2 border-dk-navy bg-white py-2.5 text-center text-xs font-bold text-dk-navy"
                >
                  거주자용 PDF
                </a>
              ) : null}
              {fieldReport.pdf_landlord_url ? (
                <a
                  href={fieldReport.pdf_landlord_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-xl border-2 border-dk-navy bg-white py-2.5 text-center text-xs font-bold text-dk-navy"
                >
                  임대인용 PDF
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {upgradeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <p className="text-sm font-bold text-slate-500">등급 업그레이드</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-900">더 큰 문제를 발견하셨나요?</h2>
            <p className="mt-1 text-xs text-slate-500">
              단순 기구교체 공임({reservation.baseFee.toLocaleString()}원)은 이미 예약금으로 결제되어, 완료 시 추가로
              받으실 작업비 결제 금액에서만 자동 차감됩니다(총 정산 금액에는 그대로 포함). 사유를 선택해주세요.
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

      {pipelineSteps ? <LoadingOverlay title="진단 리포트 생성 중" steps={pipelineSteps} /> : null}
    </div>
  );
}
