"use client";

import { useCallback, useEffect, useState } from "react";

type ChannelAnalysisProposal = {
  category: "전기안전" | "자격시험" | "실무";
  title: string;
  brief: string;
};

type ChannelAnalysisResult = {
  channelId: string;
  channelName: string;
  channelUrl: string;
  patternSummary: string;
  proposals: ChannelAnalysisProposal[];
  queueIds: string[];
  message?: string;
};

type AnalysisHistoryItem = {
  id: string;
  channel_id: string;
  channel_name: string | null;
  channel_url: string | null;
  pattern_summary: string;
  proposals: ChannelAnalysisProposal[];
  queue_ids: string[];
  created_at: string;
};

const CATEGORY_BADGE: Record<string, string> = {
  전기안전: "bg-blue-100 text-blue-800",
  자격시험: "bg-purple-100 text-purple-800",
  실무: "bg-emerald-100 text-emerald-800",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

function ProposalList({ proposals }: { proposals: ChannelAnalysisProposal[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {proposals.map((p, i) => (
        <li key={i} className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${CATEGORY_BADGE[p.category] ?? "bg-slate-100 text-slate-600"}`}>
              {p.category}
            </span>
            <h4 className="text-sm font-bold text-slate-900">{p.title}</h4>
          </div>
          {p.brief ? <p className="mt-1 text-xs text-slate-600">{p.brief}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export default function YoutubeChannelAnalysisPanel() {
  const [channelUrl, setChannelUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ChannelAnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/content/youtube-channel-analysis", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { analyses?: AnalysisHistoryItem[] };
      setHistory(json.analyses ?? []);
    } catch {
      /* 이력 조회 실패는 조용히 무시 */
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleAnalyze = async () => {
    if (!channelUrl.trim()) {
      setMessage("채널 URL, @핸들 또는 채널명을 입력하세요.");
      return;
    }
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/content/youtube-channel-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl: channelUrl.trim() }),
      });
      const json = (await res.json()) as ChannelAnalysisResult & { message?: string };
      if (!res.ok) {
        setMessage(json.message ?? "분석 실패");
        return;
      }
      setResult(json);
      setMessage(json.message ?? null);
      await loadHistory();
    } catch {
      setMessage("분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">유튜브 채널 분석 에이전트</h2>
      <p className="mt-1 text-sm text-slate-600">
        참고/경쟁 채널의 URL, @핸들 또는 채널명을 입력하면 인기 영상 패턴을 분석해 콘텐츠 제안 10건을 유튜브 PD
        클립 영상 큐에 추가합니다.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={channelUrl}
          onChange={(e) => setChannelUrl(e.target.value)}
          placeholder="예: https://www.youtube.com/@channel 또는 채널명"
          className="flex-1 min-w-[240px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleAnalyze()}
          className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "분석 중…" : "분석 시작"}
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{message}</p>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-bold text-slate-900">
            {result.channelName}{" "}
            <a href={result.channelUrl} target="_blank" rel="noreferrer" className="text-xs font-normal text-slate-500 underline">
              채널 보기
            </a>
          </h3>
          {result.patternSummary ? <p className="mt-2 text-sm text-slate-700">{result.patternSummary}</p> : null}
          <ProposalList proposals={result.proposals} />
        </div>
      ) : null}

      {history.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500">이전 분석 이력 ({history.length})</summary>
          <ul className="mt-2 space-y-3">
            {history.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900">{item.channel_name ?? item.channel_id}</h4>
                  <span className="text-xs text-slate-400">{formatDate(item.created_at)}</span>
                </div>
                {item.pattern_summary ? <p className="mt-1 text-xs text-slate-600">{item.pattern_summary}</p> : null}
                <ProposalList proposals={item.proposals} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
