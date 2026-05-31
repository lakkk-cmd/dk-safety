"use client";

import { useCallback, useEffect, useState } from "react";
import type { StructuredMemory } from "@/lib/agent-memory";

type FeedbackRow = {
  id: string;
  content: string;
  status: "pending" | "applied";
  created_at: string;
  applied_at: string | null;
};

type ReportRow = {
  id: string;
  created_at: string;
  date_label: string;
  chief_summary: string | null;
  feedback_applied: string | null;
  sections: unknown;
};

export default function AdminCommandCenterPanel() {
  const [feedbackInput, setFeedbackInput] = useState("");
  const [feedbackList, setFeedbackList] = useState<FeedbackRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [memory, setMemory] = useState<StructuredMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [fbRes, repRes, memRes] = await Promise.all([
        fetch("/api/admin/agents/feedback", { cache: "no-store" }),
        fetch("/api/admin/agents/reports?limit=10", { cache: "no-store" }),
        fetch("/api/admin/agents/memory", { cache: "no-store" }),
      ]);
      if (fbRes.ok) {
        const fb = (await fbRes.json()) as { feedback: FeedbackRow[] };
        setFeedbackList(fb.feedback ?? []);
      }
      if (repRes.ok) {
        const rep = (await repRes.json()) as { reports: ReportRow[] };
        setReports(rep.reports ?? []);
      }
      if (memRes.ok) {
        const mem = (await memRes.json()) as { structured: StructuredMemory };
        setMemory(mem.structured ?? null);
      }
    } catch {
      setMessage("데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const submitFeedback = async () => {
    const content = feedbackInput.trim();
    if (content.length < 4) {
      setMessage("피드백은 4자 이상 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/agents/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = (await res.json()) as { message?: string };
      if (!res.ok) {
        setMessage(json.message ?? "저장 실패");
        return;
      }
      setFeedbackInput("");
      setMessage("피드백이 저장되었습니다. 다음 일요일 08:00 경영진 회의에 반영됩니다.");
      await loadAll();
    } catch {
      setMessage("저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = feedbackList.filter((f) => f.status === "pending").length;

  if (loading) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">사령부 데이터 로딩 중…</p>
    );
  }

  return (
    <div className="space-y-8">
      {message ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{message}</p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">대장 피드백</h2>
        <p className="mt-1 text-sm text-slate-600">
          지시·우선순위·제약을 입력하면 다음 회의(매주 일요일 08:00 KST)에 6인 경영진 + 총괄이 반영합니다.
          {pendingCount > 0 ? (
            <span className="ml-1 font-semibold text-amber-700">대기 중 {pendingCount}건</span>
          ) : null}
        </p>
        <textarea
          className="mt-4 min-h-[120px] w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
          placeholder="예: 이번 달은 광주 흑석동 아파트 2단지 집중. 유튜브 주 1회만. 앱은 예약 알림만 우선."
          value={feedbackInput}
          onChange={(e) => setFeedbackInput(e.target.value)}
          maxLength={8000}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitFeedback()}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "저장 중…" : "피드백 제출"}
          </button>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            새로고침
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">조직 기억</h2>
        <p className="mt-1 text-sm text-slate-600">회의마다 총괄이 구조화해 갱신합니다. 다음 회의 프롬프트에 자동 주입됩니다.</p>
        {memory ? (
          <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <MemoryList title="전략 테마" items={memory.strategicThemes} />
            <MemoryList title="확정·합의" items={memory.decisions} />
            <MemoryList title="추적 KPI" items={memory.kpis} />
            <MemoryList title="미결 질문" items={memory.openQuestions} />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-slate-500">아직 기억이 없습니다. 첫 회의 후 생성됩니다.</p>
        )}
        {memory?.feedbackNotes ? (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <span className="font-semibold">최근 지시 메모: </span>
            {memory.feedbackNotes}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">피드백 이력</h2>
        <ul className="mt-4 space-y-2">
          {feedbackList.length === 0 ? (
            <li className="text-sm text-slate-500">이력 없음</li>
          ) : (
            feedbackList.slice(0, 15).map((f) => (
              <li key={f.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <span
                  className={
                    f.status === "pending"
                      ? "mr-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs font-bold text-amber-900"
                      : "mr-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-700"
                  }
                >
                  {f.status === "pending" ? "대기" : "반영됨"}
                </span>
                <span className="text-slate-800">{f.content.slice(0, 200)}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {new Date(f.created_at).toLocaleString("ko-KR")}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">경영진 보고서</h2>
        <p className="mt-1 text-sm text-slate-600">주간 Cron 결과(이메일과 동일 내용)입니다.</p>
        <ul className="mt-4 space-y-3">
          {reports.length === 0 ? (
            <li className="text-sm text-slate-500">보고서 없음 — Cron 실행 후 표시됩니다.</li>
          ) : (
            reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  onClick={() => setExpandedReport(expandedReport === r.id ? null : r.id)}
                >
                  <span>{r.date_label}</span>
                  <span className="text-xs font-normal text-slate-500">{expandedReport === r.id ? "접기" : "펼치기"}</span>
                </button>
                {expandedReport === r.id ? (
                  <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">
                    {r.feedback_applied ? (
                      <p className="mb-3 rounded-lg bg-amber-50 p-2 text-amber-950">
                        <strong>반영된 지시:</strong> {r.feedback_applied}
                      </p>
                    ) : null}
                    {r.chief_summary ?? "(총괄 요약 없음)"}
                  </div>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
        <h2 className="font-bold text-slate-800">운영 루프</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>대장이 사령부에 피드백 입력 → pending 저장</li>
          <li>매주 일요일 08:00 — 6인 2라운드 회의 + 총괄 종합 + 기억 갱신</li>
          <li>이메일 보고 + 본 화면 보고서 갱신</li>
          <li>피드백 applied 처리 → 다음 회의에 누적 기억으로 반영</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          수동 Cron 테스트: 로컬에서 <code className="rounded bg-white px-1">npm run cron:test</code>
        </p>
      </section>
    </div>
  );
}

function MemoryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <dt className="font-semibold text-slate-800">{title}</dt>
      <dd className="mt-1 text-slate-600">
        {items.length ? (
          <ul className="list-inside list-disc space-y-0.5">
            {items.map((item, i) => (
              <li key={`${title}-${i}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </dd>
    </div>
  );
}
