"use client";

import { useState } from "react";

type StepKey = "opinion" | "pdf" | "send";
type StepStatus = "pending" | "running" | "done" | "error";

const STEP_ORDER: StepKey[] = ["opinion", "pdf", "send"];
const STEP_LABEL: Record<StepKey, string> = {
  opinion: "AI 소견 생성 중...",
  pdf: "PDF 리포트 생성 중...",
  send: "알림톡 발송 중..."
};

type SendChannelResult = { channel: string; success: boolean; messageId?: string; error?: string };

export default function FieldReportPipelineButton({ fieldReportId }: { fieldReportId: string }) {
  const [steps, setSteps] = useState<Record<StepKey, StepStatus>>({ opinion: "pending", pdf: "pending", send: "pending" });
  const [stepError, setStepError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);
  const [pdfUrls, setPdfUrls] = useState<{ landlord: string | null; resident: string | null }>({ landlord: null, resident: null });
  const [sendResult, setSendResult] = useState<{ resident: SendChannelResult | null; landlord: SendChannelResult | null } | null>(null);

  const runStep = async (step: StepKey): Promise<boolean> => {
    setSteps((prev) => ({ ...prev, [step]: "running" }));
    try {
      if (step === "opinion") {
        const response = await fetch("/api/field-report/generate-opinion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldReportId })
        });
        const data = (await response.json()) as { message?: string };
        if (!response.ok) throw new Error(data.message ?? "소견 생성 실패");
      } else if (step === "pdf") {
        const response = await fetch("/api/field-report/generate-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldReportId })
        });
        const data = (await response.json()) as { pdfLandlordUrl?: string; pdfResidentUrl?: string; message?: string };
        if (!response.ok) throw new Error(data.message ?? "PDF 생성 실패");
        setPdfUrls({ landlord: data.pdfLandlordUrl ?? null, resident: data.pdfResidentUrl ?? null });
      } else {
        const response = await fetch("/api/field-report/send-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fieldReportId })
        });
        const data = (await response.json()) as {
          sendResult?: { resident: SendChannelResult | null; landlord: SendChannelResult | null };
          message?: string;
        };
        if (!response.ok) throw new Error(data.message ?? "알림톡 발송 실패");
        setSendResult(data.sendResult ?? null);
      }
      setSteps((prev) => ({ ...prev, [step]: "done" }));
      return true;
    } catch (err) {
      setSteps((prev) => ({ ...prev, [step]: "error" }));
      setStepError(err instanceof Error ? err.message : "처리에 실패했습니다.");
      return false;
    }
  };

  const runFrom = async (startStep: StepKey) => {
    setRunning(true);
    setStepError(null);
    const startedAt = Date.now();
    const startIdx = STEP_ORDER.indexOf(startStep);
    for (let i = startIdx; i < STEP_ORDER.length; i++) {
      const ok = await runStep(STEP_ORDER[i]);
      if (!ok) {
        setRunning(false);
        return;
      }
    }
    setElapsedSec(Math.round((Date.now() - startedAt) / 1000));
    setFinished(true);
    setRunning(false);
  };

  const erroredStep = STEP_ORDER.find((s) => steps[s] === "error");

  const stepIcon = (status: StepStatus) => {
    if (status === "done") return "✅";
    if (status === "running") return "⏳";
    if (status === "error") return "❌";
    return "⬜";
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-900">진단 리포트 생성 및 발송</h2>
        {!running && !finished ? (
          <button
            type="button"
            onClick={() => void runFrom("opinion")}
            className="rounded-full bg-gradient-to-r from-dk-navy to-dk-gold px-3 py-1.5 text-xs font-bold text-white"
          >
            전체 실행
          </button>
        ) : null}
      </div>

      <div className="mt-3 space-y-1.5">
        {STEP_ORDER.map((step) => (
          <div key={step} className="flex items-center gap-2 text-sm">
            <span>{stepIcon(steps[step])}</span>
            <span className={steps[step] === "error" ? "text-rose-700" : "text-slate-700"}>{STEP_LABEL[step]}</span>
          </div>
        ))}
      </div>

      {stepError ? (
        <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2">
          <p className="text-xs text-rose-800">{stepError}</p>
          {erroredStep ? (
            <button
              type="button"
              disabled={running}
              onClick={() => void runFrom(erroredStep)}
              className="mt-2 rounded-full border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700 disabled:opacity-60"
            >
              재시도
            </button>
          ) : null}
        </div>
      ) : null}

      {finished ? (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3">
          <p className="text-sm font-bold text-emerald-800">✅ 완료! (소요시간: {elapsedSec}초)</p>
          <div className="mt-2 flex gap-2">
            {pdfUrls.resident ? (
              <a href={pdfUrls.resident} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border border-emerald-200 bg-white py-2 text-center text-xs font-semibold text-slate-700">
                거주자용 PDF
              </a>
            ) : null}
            {pdfUrls.landlord ? (
              <a href={pdfUrls.landlord} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border border-emerald-200 bg-white py-2 text-center text-xs font-semibold text-slate-700">
                임대인용 PDF
              </a>
            ) : null}
          </div>
          {sendResult ? (
            <div className="mt-2 text-xs text-slate-600">
              <p>
                거주자 발송: {sendResult.resident?.success ? `성공 (${sendResult.resident.channel})` : `실패${sendResult.resident?.error ? ` (${sendResult.resident.error})` : ""}`}
              </p>
              {sendResult.landlord ? (
                <p>
                  임대인 발송: {sendResult.landlord.success ? `성공 (${sendResult.landlord.channel})` : `실패${sendResult.landlord.error ? ` (${sendResult.landlord.error})` : ""}`}
                </p>
              ) : (
                <p>임대인 연락처 미등록 — 임대인 발송 생략</p>
              )}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-emerald-700">새로고침하면 아래 패널에도 최신 상태가 반영됩니다.</p>
        </div>
      ) : null}
    </section>
  );
}
