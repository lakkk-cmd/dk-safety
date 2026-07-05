"use client";

import { useCallback, useEffect, useState } from "react";

type ImprovementRequestType = "feature" | "bug" | "ui" | "other";
type ImprovementRequestStatus =
  | "received"
  | "analyzing"
  | "issue_created"
  | "in_progress"
  | "reviewing"
  | "deploying"
  | "completed"
  | "failed";

type ImprovementRequest = {
  id: string;
  type: ImprovementRequestType;
  content: string;
  ai_title: string | null;
  status: ImprovementRequestStatus;
  github_issue_url: string | null;
  github_pr_url: string | null;
  acknowledged: boolean;
  created_at: string;
};

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
  reviewing: "리뷰 중",
  deploying: "배포 중",
  completed: "완료",
  failed: "실패",
};

const STATUS_BADGE: Record<ImprovementRequestStatus, string> = {
  received: "bg-slate-100 text-slate-600",
  analyzing: "bg-sky-100 text-sky-800",
  issue_created: "bg-cc-gold/10 text-cc-navy",
  in_progress: "bg-cc-gold/10 text-cc-navy",
  reviewing: "bg-sky-100 text-sky-800",
  deploying: "bg-cc-gold/10 text-cc-navy",
  completed: "bg-cc-green/10 text-cc-green",
  failed: "bg-cc-red/10 text-cc-red",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

/** 개선요청 탭이 삭제된 뒤, 홈 요약 스트립에 접히는 형태로 남긴 미확인 목록 위젯.
 *  새 요청 제출은 이제 채팅에서 자연어로만 한다 (createChatImprovementRequest) — 여기서는 이력 확인/전체확인만 담당. */
export default function HqImprovementInline() {
  const [items, setItems] = useState<ImprovementRequest[]>([]);
  const [unacknowledged, setUnacknowledged] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/improvement-requests", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ImprovementRequest[]; unacknowledged?: number };
      setItems(data.items ?? []);
      setUnacknowledged(data.unacknowledged ?? 0);
    } catch {
      /* 조용히 무시 */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAckAll = async () => {
    setAcking(true);
    try {
      await fetch("/api/admin/improvement-requests", { method: "PATCH" });
      await load();
    } finally {
      setAcking(false);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-100 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-xs font-bold text-slate-500">개선 요청 이력</span>
        {unacknowledged > 0 ? (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-cc-gold px-1.5 text-xs font-black text-cc-navy">
            {unacknowledged > 99 ? "99+" : unacknowledged}
          </span>
        ) : (
          <span className="text-xs text-slate-400">{expanded ? "접기" : "펼치기"}</span>
        )}
      </button>

      {expanded ? (
        <div className="mt-3 space-y-2">
          {unacknowledged > 0 ? (
            <button
              type="button"
              disabled={acking}
              onClick={() => void handleAckAll()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-cc-bg disabled:opacity-50"
            >
              {acking ? "처리 중…" : "모두 확인"}
            </button>
          ) : null}
          <ul className="space-y-2">
            {items.slice(0, 10).map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-cc-text">
                    [{TYPE_LABELS[item.type]}] {item.ai_title ?? item.content.slice(0, 40)}
                  </span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${STATUS_BADGE[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{formatDate(item.created_at)}</p>
                <div className="mt-1 flex gap-3">
                  {item.github_issue_url ? (
                    <a href={item.github_issue_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-cc-navy hover:underline">
                      GitHub Issue →
                    </a>
                  ) : null}
                  {item.github_pr_url ? (
                    <a href={item.github_pr_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-cc-navy hover:underline">
                      PR →
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
