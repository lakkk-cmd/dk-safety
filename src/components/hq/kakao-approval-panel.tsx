"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type KakaoQueueItem = {
  id: string;
  title: string;
  content: string;
  status: "planning" | "draft" | "pending" | "pending_approval" | "review_required" | "approved" | "rejected" | "published";
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

type KakaoOverviewResponse = {
  kakaoQueue: KakaoQueueItem[];
  kakaoConnected: boolean;
  kakaoOAuthEnabled: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  planning: "기획 중",
  draft: "승인대기",
  pending: "최종승인대기",
  pending_approval: "승인 대기",
  review_required: "⚠️ 검증실패(검토필요)",
  approved: "승인됨",
  rejected: "반려됨",
  published: "발행됨",
};

const STATUS_BADGE: Record<string, string> = {
  planning: "bg-slate-100 text-slate-600",
  draft: "bg-amber-100 text-amber-800",
  pending: "bg-amber-100 text-amber-800",
  pending_approval: "bg-amber-100 text-amber-800",
  review_required: "bg-red-100 text-red-700",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  published: "bg-emerald-100 text-emerald-800",
};

const APPROVABLE_STATUSES = ["draft", "pending", "pending_approval", "review_required"];

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${STATUS_BADGE[status] ?? "bg-slate-100 text-slate-600"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("ko-KR") : "-";
}

/** 카카오 채널 포스트 승인 전용 화면 — 유튜브·블로그는 절대 섞이지 않는다(2026-09-06 신설).
 *  /api/admin/content/kakao의 GET/PATCH/DELETE만 사용한다. */
export default function KakaoApprovalPanel() {
  const [data, setData] = useState<KakaoOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/content/kakao", { cache: "no-store" });
      const json = (await res.json()) as KakaoOverviewResponse & { message?: string };
      if (!res.ok) {
        setMessage(json.message ?? "조회 실패");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setMessage("데이터를 불러오지 못했습니다.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleAction = async (id: string, action: "approve" | "reject" | "delete") => {
    if (action === "delete" && !confirm("이 카카오 포스트를 삭제하시겠습니까?")) return;
    if (action === "reject" && !confirm("이 카카오 포스트를 반려하시겠습니까?")) return;
    const reason = action === "reject" ? window.prompt("반려 이유 (선택)") ?? "" : undefined;
    setBusyId(id);
    setMessage(null);
    try {
      const res =
        action === "delete"
          ? await fetch(`/api/admin/content/kakao?id=${id}`, { method: "DELETE" })
          : await fetch("/api/admin/content/kakao", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, action, reason }),
            });
      const json = (await res.json()) as { message?: string };
      setMessage(json.message ?? (res.ok ? "처리 완료" : "처리 실패"));
      if (res.ok) await loadAll();
    } catch {
      setMessage("처리 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">카카오 포스트 로딩 중…</p>;
  }
  if (!data) {
    return <p className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{message ?? "데이터를 불러오지 못했습니다."}</p>;
  }

  const pendingCount = data.kakaoQueue.filter((i) => APPROVABLE_STATUSES.includes(i.status)).length;

  return (
    <div className="space-y-6">
      {message ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{message}</p> : null}

      <section className="rounded-2xl border-2 border-slate-900 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">카카오 승인 대기 {pendingCount}건</h2>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
          >
            새로고침
          </button>
        </div>
      </section>

      {data.kakaoOAuthEnabled ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">카카오 연동</h2>
          {data.kakaoConnected ? (
            <p className="mt-2 text-sm font-semibold text-emerald-700">✅ 카카오 계정이 연동되어 있습니다.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">
                카카오 계정을 연동하면 승인 시 &quot;나에게 보내기&quot; 메모로 포스트 발행 알림을 실제로 받을 수 있습니다.
              </p>
              <Link
                href="/api/auth/kakao/connect"
                className="mt-3 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
              >
                카카오 연동하기
              </Link>
            </>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          카카오 연동이 비활성화되어 있습니다. <code className="rounded bg-white px-1">KAKAO_REST_API_KEY</code> 설정 시 사용할 수 있습니다.
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">카카오 매니저 톡톡 — 포스트 큐</h2>
        <ul className="mt-4 space-y-3">
          {data.kakaoQueue.length === 0 ? (
            <li className="text-sm text-slate-500">대기 중인 카카오 포스트가 없습니다.</li>
          ) : (
            data.kakaoQueue.map((item) => (
              <li key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                  <StatusBadge status={item.status} />
                </div>
                {item.content ? (
                  <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    {item.content}
                  </div>
                ) : null}
                {item.reject_reason ? <p className="mt-2 text-xs text-red-700">반려 이유: {item.reject_reason}</p> : null}
                <p className="mt-2 text-xs text-slate-400">생성: {formatDate(item.created_at)}</p>

                {APPROVABLE_STATUSES.includes(item.status) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleAction(item.id, "approve")}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      승인 (카카오로 발행 알림 전송)
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleAction(item.id, "reject")}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      반려
                    </button>
                  </div>
                ) : null}
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void handleAction(item.id, "delete")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
