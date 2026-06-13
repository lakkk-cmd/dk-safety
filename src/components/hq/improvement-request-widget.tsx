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
  analyzing: "bg-blue-100 text-blue-800",
  issue_created: "bg-amber-100 text-amber-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

export default function ImprovementRequestWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<ImprovementRequest[]>([]);
  const [unacknowledged, setUnacknowledged] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [type, setType] = useState<ImprovementRequestType>("feature");
  const [content, setContent] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/improvement-requests");
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ImprovementRequest[]; unacknowledged?: number };
      setItems(data.items ?? []);
      setUnacknowledged(data.unacknowledged ?? 0);
    } catch {
      // 배지 갱신 실패는 조용히 무시
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const openModal = useCallback(async () => {
    setIsOpen(true);
    setLoading(true);
    await refresh();
    setLoading(false);
    if (unacknowledged > 0) {
      try {
        await fetch("/api/admin/improvement-requests", { method: "PATCH" });
        setUnacknowledged(0);
      } catch {
        // 무시
      }
    }
  }, [refresh, unacknowledged]);

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
            (data.item?.github_issue_url
              ? `요청이 접수되어 GitHub Issue가 생성되었습니다.`
              : "요청이 접수되었습니다."),
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
    <>
      <button
        type="button"
        onClick={openModal}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800"
      >
        ⚙️ 개선 요청
        {unacknowledged > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
            {unacknowledged > 9 ? "9+" : unacknowledged}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">⚙️ 개선 요청</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">요청 유형</label>
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                        type === opt.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
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
                  rows={4}
                  placeholder="개선이 필요한 내용을 자유롭게 작성해주세요."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
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

              {message && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? "제출 중…" : "요청 제출"}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-bold text-slate-900">요청 내역</h3>
              {loading ? (
                <p className="mt-2 text-xs text-slate-500">불러오는 중…</p>
              ) : items.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">아직 제출한 요청이 없습니다.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="rounded-xl border border-slate-200 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800">
                          [{TYPE_LABELS[item.type]}] {item.ai_title ?? item.content.slice(0, 40)}
                        </span>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 font-bold ${STATUS_BADGE[item.status]}`}>
                          {STATUS_LABELS[item.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-500">{formatDate(item.created_at)}</p>
                      {item.error_message && <p className="mt-1 text-red-600">{item.error_message}</p>}
                      <div className="mt-1 flex gap-3">
                        {item.github_issue_url && (
                          <a
                            href={item.github_issue_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-blue-700 hover:underline"
                          >
                            GitHub Issue →
                          </a>
                        )}
                        {item.github_pr_url && (
                          <a
                            href={item.github_pr_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-blue-700 hover:underline"
                          >
                            PR →
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
