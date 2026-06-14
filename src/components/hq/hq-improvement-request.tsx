"use client";

import { useCallback, useEffect, useState } from "react";

type ImprovementRequestType = "feature" | "bug" | "ui" | "other";
type ImprovementRequestStatus = "received" | "analyzing" | "issue_created" | "in_progress" | "completed" | "failed";

type ImprovementRequest = {
  id: string;
  type: ImprovementRequestType;
  content: string;
  screenshot_url: string | null;
  ai_title: string | null;
  ai_analysis: string | null;
  status: ImprovementRequestStatus;
  github_issue_url: string | null;
  github_pr_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

const TYPE_OPTIONS: { value: ImprovementRequestType; label: string }[] = [
  { value: "feature", label: "기능 추가" },
  { value: "bug", label: "버그 수정" },
  { value: "ui", label: "UI 변경" },
  { value: "other", label: "기타" },
];

const TYPE_LABELS: Record<ImprovementRequestType, string> = {
  feature: "기능 추가",
  bug: "버그 수정",
  ui: "UI 변경",
  other: "기타",
};

const STATUS_LABELS: Record<ImprovementRequestStatus, string> = {
  received: "접수됨",
  analyzing: "분석 중",
  issue_created: "이슈 생성됨",
  in_progress: "구현 중",
  completed: "완료",
  failed: "실패",
};

const STATUS_BADGE: Record<ImprovementRequestStatus, string> = {
  received: "bg-slate-100 text-slate-600",
  analyzing: "bg-sky-100 text-sky-800",
  issue_created: "bg-cc-gold/10 text-cc-navy",
  in_progress: "bg-cc-gold/10 text-cc-navy",
  completed: "bg-cc-green/10 text-cc-green",
  failed: "bg-cc-red/10 text-cc-red",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

export default function HqImprovementRequest() {
  const [items, setItems] = useState<ImprovementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [type, setType] = useState<ImprovementRequestType>("feature");
  const [content, setContent] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/improvement-requests");
      if (res.ok) {
        const data = (await res.json()) as { items?: ImprovementRequest[] };
        setItems(data.items ?? []);
      }
      await fetch("/api/admin/improvement-requests", { method: "PATCH" }).catch(() => undefined);
    } catch {
      // 목록 갱신 실패는 조용히 무시
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!content.trim()) {
        setMessage("요청 내용을 입력해주세요.");
        return;
      }
      setSubmitting(true);
      setMessage(null);
      try {
        const formData = new FormData();
        formData.set("type", type);
        formData.set("content", content.trim());
        if (screenshot) formData.set("screenshot", screenshot);

        const res = await fetch("/api/admin/improvement-requests", { method: "POST", body: formData });
        const data = (await res.json()) as { item?: ImprovementRequest; message?: string };
        if (!res.ok) {
          setMessage(data.message ?? "요청 제출에 실패했습니다.");
          return;
        }

        if (data.item) {
          setItems((prev) => [data.item as ImprovementRequest, ...prev]);
        }
        setMessage(
          data.message ??
            (data.item?.github_issue_url ? "요청이 접수되어 GitHub Issue가 생성되었습니다." : "요청이 접수되었습니다."),
        );
        setContent("");
        setScreenshot(null);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "요청 제출 중 오류가 발생했습니다.");
      } finally {
        setSubmitting(false);
      }
    },
    [content, type, screenshot],
  );

  return (
    <div className="space-y-4">
      {message ? <p className="cc-card border border-cc-gold/30 bg-cc-gold/10 px-4 py-3 text-sm text-cc-navy">{message}</p> : null}

      <section className="cc-card p-6">
        <h2 className="text-base font-black text-cc-text">개선 요청 작성</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">요청 유형</label>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`flex min-h-12 items-center rounded-xl border px-4 text-sm font-bold transition ${
                    type === opt.value ? "border-cc-navy bg-cc-navy text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-cc-bg"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">요청 내용</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="개선이 필요한 내용을 자유롭게 작성해주세요."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-cc-navy focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">스크린샷 첨부 (선택)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-cc-navy px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? "제출 중…" : "요청 제출"}
          </button>
        </form>
      </section>

      <section className="cc-card p-6">
        <h2 className="text-base font-black text-cc-text">요청 내역</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">아직 제출한 요청이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-slate-100 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-cc-text">
                    [{TYPE_LABELS[item.type]}] {item.ai_title ?? item.content.slice(0, 40)}
                  </span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${STATUS_BADGE[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{formatDate(item.created_at)}</p>
                {item.error_message && <p className="mt-1 text-xs text-cc-red">{item.error_message}</p>}
                <div className="mt-2 flex gap-3">
                  {item.github_issue_url && (
                    <a href={item.github_issue_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-cc-navy hover:underline">
                      GitHub Issue →
                    </a>
                  )}
                  {item.github_pr_url && (
                    <a href={item.github_pr_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-cc-navy hover:underline">
                      PR →
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
