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

type AgentResponseItem = {
  agent_id: string;
  agent_name: string;
  role: string;
  response: string;
};

type ReportSection = {
  topic: string;
  chief_summary: string;
  round1: AgentResponseItem[];
  round2: AgentResponseItem[];
};

type ReportRow = {
  id: string;
  created_at: string;
  date_label: string;
  chief_summary: string | null;
  feedback_applied: string | null;
  sections: ReportSection[] | null;
  approved: boolean;
  approved_at: string | null;
};

type MeetingConfigResponse = {
  scheduleSummary?: string;
  topics?: string[];
  schedule?: { firstReportDate: string; firstReportCompleted: boolean };
};

export default function HqCommandCenterPanel() {
  const [feedbackInput, setFeedbackInput] = useState("");
  const [topicsText, setTopicsText] = useState("");
  const [savedTopics, setSavedTopics] = useState<string[]>([]);
  const [scheduleSummary, setScheduleSummary] = useState("");
  const [feedbackList, setFeedbackList] = useState<FeedbackRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [memory, setMemory] = useState<StructuredMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [topicsSubmitting, setTopicsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [fbRes, repRes, memRes, cfgRes] = await Promise.all([
        fetch("/api/admin/agents/feedback", { cache: "no-store" }),
        fetch("/api/admin/agents/reports?limit=10", { cache: "no-store" }),
        fetch("/api/admin/agents/memory", { cache: "no-store" }),
        fetch("/api/admin/agents/meeting-config", { cache: "no-store" }),
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
      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as MeetingConfigResponse;
        const topics = cfg.topics ?? [];
        setSavedTopics(topics);
        setScheduleSummary(cfg.scheduleSummary ?? "");
        if (topics.length) setTopicsText(topics.join("\n"));
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

  const submitTopics = async () => {
    const lines = topicsText
      .split("\n")
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);
    if (!lines.length) {
      setMessage("회의 주제를 한 줄에 하나씩 입력해 주세요.");
      return;
    }
    setTopicsSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/agents/meeting-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicsText }),
      });
      const json = (await res.json()) as { message?: string; topics?: string[] };
      if (!res.ok) {
        setMessage(json.message ?? "주제 저장 실패");
        return;
      }
      setSavedTopics(json.topics ?? lines);
      setMessage(json.message ?? "회의 주제가 저장되었습니다.");
      await loadAll();
    } catch {
      setMessage("주제 저장 중 오류가 발생했습니다.");
    } finally {
      setTopicsSubmitting(false);
    }
  };

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
      setMessage("피드백이 저장되었습니다. 다음 예정 회의(첫 보고 또는 일요일 08:00)에 반영됩니다.");
      await loadAll();
    } catch {
      setMessage("저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTopic = async (topic: string) => {
    const res = await fetch(`/api/admin/agents/meeting-config?topic=${encodeURIComponent(topic)}`, {
      method: "DELETE",
    });
    const json = (await res.json()) as { message?: string; topics?: string[] };
    setMessage(json.message ?? (res.ok ? "삭제 완료" : "삭제 실패"));
    if (res.ok) {
      const updated = json.topics ?? savedTopics.filter((t) => t !== topic);
      setSavedTopics(updated);
      setTopicsText(updated.join("\n"));
    }
  };

  const deleteAllTopics = async () => {
    if (!confirm("회의 주제를 모두 삭제하시겠습니까?")) return;
    const res = await fetch("/api/admin/agents/meeting-config?all=true", { method: "DELETE" });
    const json = (await res.json()) as { message?: string };
    setMessage(json.message ?? (res.ok ? "전체 삭제 완료" : "삭제 실패"));
    if (res.ok) {
      setSavedTopics([]);
      setTopicsText("");
    }
  };

  const deleteReport = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/admin/agents/reports?id=${id}`, { method: "DELETE" });
    const json = (await res.json()) as { message?: string };
    setMessage(json.message ?? (res.ok ? "삭제 완료" : "삭제 실패"));
    if (res.ok) await loadAll();
  };

  const deleteAllReports = async () => {
    if (!confirm("전체 보고서를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    const res = await fetch("/api/admin/agents/reports?all=true", { method: "DELETE" });
    const json = (await res.json()) as { message?: string };
    setMessage(json.message ?? (res.ok ? "전체 삭제 완료" : "삭제 실패"));
    if (res.ok) await loadAll();
  };

  const toggleApproval = async (r: ReportRow) => {
    setApprovingId(r.id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/agents/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, approved: !r.approved }),
      });
      const json = (await res.json()) as { message?: string };
      setMessage(json.message ?? (res.ok ? "처리 완료" : "처리 실패"));
      if (res.ok) await loadAll();
    } catch {
      setMessage("승인 처리 중 오류가 발생했습니다.");
    } finally {
      setApprovingId(null);
    }
  };

  const printReport = (r: ReportRow) => {
    const agents = (r.sections ?? []).flatMap((s) => s.round2?.length ? s.round2 : s.round1);
    const agentRows = agents.map((a) =>
      `<div style="margin-bottom:14px;padding:10px 14px;border-left:3px solid #333;background:#f9f9f9;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:#555;margin-bottom:5px">${a.agent_name} · ${a.role}</div>
        <div style="font-size:12px;line-height:1.7;white-space:pre-wrap">${a.response.slice(0, 600)}</div>
      </div>`
    ).join("");
    const sectionRows = (r.sections ?? []).map((s) =>
      `<h3 style="font-size:13px;font-weight:700;margin:18px 0 6px">${s.topic}</h3>
       <div style="font-size:12px;color:#444;white-space:pre-wrap;margin-bottom:10px">${s.chief_summary ?? ""}</div>`
    ).join("");
    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>대경이엔피 경영진 보고서 — ${r.date_label}</title>
<style>body{font-family:-apple-system,sans-serif;margin:0;padding:32px;color:#111;max-width:780px;margin:auto}
@media print{body{padding:16px}button{display:none}}
h1{font-size:20px;font-weight:900;margin:0}h2{font-size:15px;margin:20px 0 8px}
.header{border-bottom:3px solid #111;padding-bottom:16px;margin-bottom:24px}
.badge{font-size:10px;font-weight:700;letter-spacing:.1em;color:#888;text-transform:uppercase;margin-bottom:6px}
.chief-box{background:#111;color:#f5f5f3;padding:20px 22px;border-radius:10px;white-space:pre-wrap;font-size:13px;line-height:1.9;margin-bottom:24px}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid #ddd;font-size:11px;color:#999;text-align:center}</style>
</head><body>
<div class="header">
  <div class="badge">Weekly Executive Report</div>
  <h1>대경이엔피 경영진 보고서</h1>
  <p style="margin:6px 0 0;font-size:13px;color:#666">${r.date_label} · 우리집 안심전기</p>
</div>
<button onclick="window.print()" style="margin-bottom:20px;padding:8px 18px;background:#111;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer">🖨️ 인쇄</button>
<h2>총괄 코디네이터 종합 보고</h2>
<div class="chief-box">${r.chief_summary ?? "(없음)"}</div>
${sectionRows ? `<h2>주제별 요약</h2>${sectionRows}` : ""}
<h2>경영진 핵심 의견</h2>
${agentRows || "<p style='color:#999;font-size:13px'>에이전트 응답 없음</p>"}
<div class="footer">대경이엔피 · 우리집 안심전기 · dkansim.com</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
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

      <section className="rounded-2xl border-2 border-slate-900 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">다음 회의 주제</h2>
          {savedTopics.length > 0 && (
            <button
              type="button"
              onClick={() => void deleteAllTopics()}
              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"
            >
              🗑️ 전체 삭제
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          첫 보고는 <strong>내일 08:00 KST</strong>, 이후 <strong>매주 토요일 08:00</strong>에 진행됩니다.
        </p>
        {scheduleSummary ? (
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">{scheduleSummary}</p>
        ) : null}

        {savedTopics.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {savedTopics.map((topic) => (
              <li
                key={topic}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className="text-sm font-medium text-slate-800">{topic}</span>
                <button
                  type="button"
                  onClick={() => void deleteTopic(topic)}
                  className="ml-3 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm font-semibold text-amber-800">
            아직 저장된 주제가 없습니다. 아래에 입력 후 저장하세요.
          </p>
        )}

        <p className="mt-4 text-xs font-semibold text-slate-500">주제 추가 (한 줄에 하나씩, 저장 시 전체 교체)</p>
        <textarea
          className="mt-1.5 min-h-[120px] w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
          placeholder={"광주 아파트 런칭 90일 실행계획\n앱 MVP 우선순위 재정렬\n6월 손익분기점 달성 시나리오"}
          value={topicsText}
          onChange={(e) => setTopicsText(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={topicsSubmitting}
            onClick={() => void submitTopics()}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {topicsSubmitting ? "저장 중…" : "회의 주제 저장"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">대장 피드백</h2>
        <p className="mt-1 text-sm text-slate-600">
          지시·우선순위·제약을 입력하면 다음 예정 회의에 6인 경영진 + 총괄이 반영합니다.
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">경영진 보고서</h2>
            <p className="mt-1 text-sm text-slate-600">주간 Cron 결과(이메일과 동일 내용)입니다. 콘텐츠 제작용으로 승인하면 report.dkansim.com 아카이브에 표시됩니다.</p>
          </div>
          {reports.length > 0 && (
            <button
              type="button"
              onClick={() => void deleteAllReports()}
              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"
            >
              🗑️ 전체 삭제
            </button>
          )}
        </div>
        <ul className="mt-4 space-y-3">
          {reports.length === 0 ? (
            <li className="text-sm text-slate-500">보고서 없음 — Cron 실행 후 표시됩니다.</li>
          ) : (
            reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200">
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    type="button"
                    className="flex-1 text-left text-sm font-semibold text-slate-900 hover:text-slate-600"
                    onClick={() => setExpandedReport(expandedReport === r.id ? null : r.id)}
                  >
                    {r.date_label}
                    {r.approved ? (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800">
                        승인됨
                      </span>
                    ) : null}
                    <span className="ml-2 text-xs font-normal text-slate-500">{expandedReport === r.id ? "접기" : "펼치기"}</span>
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={approvingId === r.id}
                      onClick={() => void toggleApproval(r)}
                      className={
                        r.approved
                          ? "rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                          : "rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      }
                    >
                      {r.approved ? "✅ 승인 취소" : "콘텐츠 승인"}
                    </button>
                    <button
                      type="button"
                      onClick={() => printReport(r)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      🖨️ 인쇄
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteReport(r.id)}
                      className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                </div>
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
          <li>사령부에서 회의 주제 저장 (첫 회의 전 필수)</li>
          <li>대장 피드백 입력 → pending 저장</li>
          <li>첫 보고: 내일 08:00 KST · 이후 매주 토요일 08:00</li>
          <li>이메일 보고 + 본 화면 보고서·조직 기억 갱신</li>
          <li>콘텐츠로 쓸 보고서는 &ldquo;콘텐츠 승인&rdquo; → report.dkansim.com 아카이브에 노출</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          수동 전체 회의 실행: <code className="rounded bg-white px-1">npm run cron:test</code> (force=1)
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
