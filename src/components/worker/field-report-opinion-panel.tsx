"use client";

import { useState } from "react";

type Props = {
  fieldReportId: string;
  initialLandlord: string | null;
  initialResident: string | null;
  initialPdfLandlordUrl: string | null;
  initialPdfResidentUrl: string | null;
};

export default function FieldReportOpinionPanel({
  fieldReportId,
  initialLandlord,
  initialResident,
  initialPdfLandlordUrl,
  initialPdfResidentUrl
}: Props) {
  const [landlord, setLandlord] = useState(initialLandlord);
  const [resident, setResident] = useState(initialResident);
  const [tab, setTab] = useState<"landlord" | "resident">("resident");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pdfLandlordUrl, setPdfLandlordUrl] = useState(initialPdfLandlordUrl);
  const [pdfResidentUrl, setPdfResidentUrl] = useState(initialPdfResidentUrl);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/field-report/generate-opinion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldReportId })
      });
      const data = (await response.json()) as { opinionLandlord?: string; opinionResident?: string; message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "소견 생성에 실패했습니다.");
        return;
      }
      setLandlord(data.opinionLandlord ?? null);
      setResident(data.opinionResident ?? null);
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const generatePdf = async () => {
    setPdfBusy(true);
    setPdfMessage(null);
    try {
      const response = await fetch("/api/field-report/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldReportId })
      });
      const data = (await response.json()) as { pdfLandlordUrl?: string; pdfResidentUrl?: string; message?: string };
      if (!response.ok) {
        setPdfMessage(data.message ?? "PDF 생성에 실패했습니다.");
        return;
      }
      setPdfLandlordUrl(data.pdfLandlordUrl ?? null);
      setPdfResidentUrl(data.pdfResidentUrl ?? null);
    } catch {
      setPdfMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setPdfBusy(false);
    }
  };

  const hasOpinion = Boolean(landlord || resident);
  const hasPdf = Boolean(pdfLandlordUrl || pdfResidentUrl);

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-900">AI 진단 소견</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="rounded-full bg-gradient-to-r from-dk-navy to-dk-blue px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {busy ? "생성 중..." : hasOpinion ? "다시 생성" : "AI 소견 생성"}
        </button>
      </div>

      {message ? <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">{message}</p> : null}

      {hasOpinion ? (
        <div className="mt-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("resident")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                tab === "resident" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              거주자용
            </button>
            <button
              type="button"
              onClick={() => setTab("landlord")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                tab === "landlord" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              임대인용
            </button>
          </div>
          <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800">
            {tab === "resident" ? resident : landlord}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-600">계측값과 KEC 규정을 근거로 임대인용/거주자용 소견을 생성합니다.</p>
      )}

      {hasOpinion ? (
        <div className="mt-4 border-t border-blue-100 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">진단 리포트 PDF</h3>
            <button
              type="button"
              disabled={pdfBusy}
              onClick={() => void generatePdf()}
              className="rounded-full bg-gradient-to-r from-dk-gold to-dk-blue px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {pdfBusy ? "생성 중..." : hasPdf ? "다시 생성" : "PDF 생성"}
            </button>
          </div>
          {pdfMessage ? <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">{pdfMessage}</p> : null}
          {hasPdf ? (
            <div className="mt-3 flex gap-2">
              {pdfResidentUrl ? (
                <a
                  href={pdfResidentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-semibold text-slate-700"
                >
                  거주자용 PDF 열기
                </a>
              ) : null}
              {pdfLandlordUrl ? (
                <a
                  href={pdfLandlordUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-semibold text-slate-700"
                >
                  임대인용 PDF 열기
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
