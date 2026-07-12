"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type VideoScene = {
  narration: string;
  imagePrompt: string;
  imageUrl?: string;
};

type YoutubeQueueItem = {
  id: string;
  title: string;
  competitor_notes: string | null;
  script: string | null;
  thumbnail_concept: string | null;
  status: "planning" | "draft" | "pending" | "pending_approval" | "review_required" | "approved" | "rejected" | "uploaded" | "producing" | "veo_generating" | "assets_ready";
  youtube_video_id: string | null;
  scenes: VideoScene[];
  video_asset_url: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  stats_updated_at: string | null;
};

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

type BlogPostItem = {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  meta_description: string | null;
  keywords: string[];
  status: "draft" | "pending_approval" | "review_required" | "published" | "rejected";
  agent_source: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  view_count: number;
};

type OverviewResponse = {
  youtubeQueue: YoutubeQueueItem[];
  kakaoQueue: KakaoQueueItem[];
  blogPosts: BlogPostItem[];
  pending: { youtube: number; kakao: number; blog: number };
  trendKeywords: string[];
  youtubeConnected: boolean;
  youtubeOAuthEnabled: boolean;
  kakaoConnected: boolean;
  kakaoOAuthEnabled: boolean;
  memoryLog: string;
  performanceLessons: string;
};

const STATUS_LABEL: Record<string, string> = {
  planning: "기획 중",
  draft: "승인대기",
  pending: "최종승인대기",
  pending_approval: "승인 대기",
  review_required: "⚠️ 검증실패(검토필요)",
  approved: "승인됨",
  producing: "영상 제작 중",
  veo_generating: "Veo 영상 생성 중",
  assets_ready: "영상 자산 준비됨",
  rejected: "반려됨",
  uploaded: "업로드됨",
  published: "발행됨",
};

const STATUS_BADGE: Record<string, string> = {
  planning: "bg-slate-100 text-slate-600",
  draft: "bg-amber-100 text-amber-800",
  pending: "bg-orange-100 text-orange-800",
  pending_approval: "bg-amber-100 text-amber-800",
  review_required: "bg-red-100 text-red-800",
  approved: "bg-blue-100 text-blue-800",
  producing: "bg-amber-100 text-amber-800",
  veo_generating: "bg-purple-100 text-purple-800",
  assets_ready: "bg-violet-100 text-violet-800",
  rejected: "bg-red-100 text-red-700",
  uploaded: "bg-emerald-100 text-emerald-800",
  published: "bg-emerald-100 text-emerald-800",
};

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

export default function ContentApprovalPanel() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/content/overview", { cache: "no-store" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        setMessage(json.message ?? "데이터를 불러오지 못했습니다.");
        return;
      }
      setData((await res.json()) as OverviewResponse);
    } catch {
      setMessage("데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleKakao = async (id: string, action: "approve" | "reject" | "delete") => {
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

  const handleBlog = async (id: string, action: "approve" | "reject" | "delete") => {
    if (action === "delete" && !confirm("이 블로그 글을 삭제하시겠습니까?")) return;
    if (action === "reject" && !confirm("이 블로그 글을 반려하시겠습니까?")) return;
    const reason = action === "reject" ? window.prompt("반려 이유 (선택)") ?? "" : undefined;
    setBusyId(id);
    setMessage(null);
    try {
      const res =
        action === "delete"
          ? await fetch(`/api/admin/content/blog?id=${id}`, { method: "DELETE" })
          : await fetch("/api/admin/content/blog", {
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

  const handleYoutubeReject = async (id: string) => {
    if (!confirm("이 유튜브 기획을 반려하시겠습니까?")) return;
    const reason = window.prompt("반려 이유 (선택)") ?? "";
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/content/youtube", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "reject", reason }),
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

  const handleYoutubeDelete = async (id: string) => {
    if (!confirm("이 유튜브 기획을 삭제하시겠습니까?")) return;
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/content/youtube?id=${id}`, { method: "DELETE" });
      const json = (await res.json()) as { message?: string };
      setMessage(json.message ?? (res.ok ? "처리 완료" : "처리 실패"));
      if (res.ok) await loadAll();
    } catch {
      setMessage("처리 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const handleYoutubeApprove = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("id", id);
      form.set("action", "approve");
      const file = fileInputRefs.current[id]?.files?.[0];
      if (file) form.set("video", file);
      const res = await fetch("/api/admin/content/youtube", { method: "PATCH", body: form });
      const json = (await res.json()) as { message?: string };
      setMessage(json.message ?? (res.ok ? "처리 완료" : "처리 실패"));
      if (res.ok) await loadAll();
    } catch {
      setMessage("처리 중 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const handleVideoProduction = async (id: string) => {
    if (!confirm("이 기획의 영상 제작(씬 분해 + 이미지 생성)을 시작하시겠습니까? 시간이 다소 걸릴 수 있습니다.")) return;
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/content/video-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId: id }),
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

  const triggerNaverCollect = async () => {
    setMessage(null);
    try {
      const res = await fetch("/api/admin/content/naver-trends", { method: "POST" });
      const json = (await res.json()) as { message?: string };
      setMessage(json.message ?? (res.ok ? "수집 완료" : "수집 실패"));
      if (res.ok) await loadAll();
    } catch {
      setMessage("수집 중 오류가 발생했습니다.");
    }
  };

  if (loading) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        콘텐츠 사령부 데이터 로딩 중…
      </p>
    );
  }

  if (!data) {
    return (
      <p className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {message ?? "데이터를 불러오지 못했습니다."}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {message ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{message}</p>
      ) : null}

      <section id="pending-queue" className="scroll-mt-6 rounded-2xl border-2 border-slate-900 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">승인 대기 현황</h2>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
          >
            새로고침
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold text-slate-500">유튜브</dt>
            <dd className="mt-1 text-2xl font-black text-slate-900">{data.pending.youtube}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold text-slate-500">카카오</dt>
            <dd className="mt-1 text-2xl font-black text-slate-900">{data.pending.kakao}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold text-slate-500">블로그</dt>
            <dd className="mt-1 text-2xl font-black text-slate-900">{data.pending.blog}</dd>
          </div>
        </dl>
        {data.memoryLog ? (
          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {data.memoryLog}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">📊 콘텐츠 성과 학습</h2>
        {data.performanceLessons ? (
          <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            {data.performanceLessons}
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            아직 성과 분석 결과가 없습니다. 매주 일요일 07:00 콘텐츠 성과 리뷰가 실행되면 여기에 학습 내역이 표시됩니다.
          </p>
        )}
      </section>

      {data.youtubeOAuthEnabled ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">유튜브 연동</h2>
          {data.youtubeConnected ? (
            <p className="mt-2 text-sm font-semibold text-emerald-700">✅ 유튜브 채널이 연동되어 있습니다.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">
                유튜브 채널을 연동하면 승인 시 영상 파일을 직접 업로드할 수 있습니다.
              </p>
              <Link
                href="/api/auth/youtube/connect"
                className="mt-3 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
              >
                유튜브 연동하기
              </Link>
            </>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          유튜브 업로드 연동이 비활성화되어 있습니다. <code className="rounded bg-white px-1">YOUTUBE_CLIENT_ID</code>/
          <code className="rounded bg-white px-1">YOUTUBE_CLIENT_SECRET</code> 설정 시 사용할 수 있습니다.
        </section>
      )}

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
        <h2 className="text-lg font-bold text-slate-900">유튜브 PD 클립 — 영상 큐</h2>
        <ul className="mt-4 space-y-3">
          {data.youtubeQueue.length === 0 ? (
            <li className="text-sm text-slate-500">대기 중인 영상 기획이 없습니다.</li>
          ) : (
            data.youtubeQueue.map((item) => (
              <li key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                  <StatusBadge status={item.status} />
                </div>
                {item.competitor_notes ? (
                  <p className="mt-2 text-xs text-slate-600">경쟁분석/기획: {item.competitor_notes}</p>
                ) : null}
                {item.script ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-500">스크립트 보기</summary>
                    <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                      {item.script}
                    </div>
                  </details>
                ) : null}
                {item.thumbnail_concept ? (
                  <p className="mt-2 text-xs text-slate-600">썸네일 기획: {item.thumbnail_concept}</p>
                ) : null}
                {item.youtube_video_id ? (
                  <p className="mt-2 text-xs text-emerald-700">
                    업로드된 영상:{" "}
                    <a
                      className="font-semibold underline"
                      href={`https://www.youtube.com/watch?v=${item.youtube_video_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.youtube_video_id}
                    </a>
                  </p>
                ) : null}
                {item.video_asset_url ? (
                  <p className="mt-2 text-xs text-emerald-700">
                    합성된 영상:{" "}
                    <a
                      className="font-semibold underline"
                      href={item.video_asset_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      final.mp4
                    </a>
                  </p>
                ) : null}
                {item.status === "uploaded" && item.stats_updated_at ? (
                  <p className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">조회수 {item.view_count}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">좋아요 {item.like_count}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">댓글 {item.comment_count}</span>
                  </p>
                ) : null}
                {item.status === "producing" ? (
                  <p className="mt-2 text-xs font-semibold text-amber-700">
                    🎬 씬 분해 및 이미지 생성 중입니다… (페이지를 새로고침하면 진행 상태를 확인할 수 있습니다)
                  </p>
                ) : null}
                {item.status === "veo_generating" ? (
                  <p className="mt-2 text-xs font-semibold text-purple-700">
                    🎥 Veo 3.1 AI 영상 생성 중… GitHub Actions가 처리 중입니다 (씬당 최대 10분). 새로고침으로 확인하세요.
                  </p>
                ) : null}
                {item.scenes && item.scenes.length > 0 ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-500">
                      영상 씬 미리보기 ({item.scenes.length}개)
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {item.scenes.map((scene, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 p-1.5">
                          {scene.imageUrl ? (
                            <img
                              src={scene.imageUrl}
                              alt={`씬 ${i + 1}`}
                              className="aspect-[9/16] w-full rounded object-cover"
                            />
                          ) : (
                            <div className="flex aspect-[9/16] w-full items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
                              이미지 없음
                            </div>
                          )}
                          <p className="mt-1 line-clamp-3 text-[11px] text-slate-600">{scene.narration}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
                {item.reject_reason ? (
                  <p className="mt-2 text-xs text-red-700">반려 이유: {item.reject_reason}</p>
                ) : null}
                <p className="mt-2 text-xs text-slate-400">생성: {formatDate(item.created_at)}</p>

                {["draft", "pending", "pending_approval", "review_required"].includes(item.status) ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept="video/*"
                      ref={(el) => {
                        fileInputRefs.current[item.id] = el;
                      }}
                      className="text-xs"
                    />
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleYoutubeApprove(item.id)}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      승인 (영상 업로드 시 즉시 게시)
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleYoutubeReject(item.id)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      반려
                    </button>
                  </div>
                ) : null}

                {item.status === "approved" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleVideoProduction(item.id)}
                      className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                    >
                      🎬 영상 제작 시작
                    </button>
                  </div>
                ) : null}
                {item.status === "assets_ready" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleVideoProduction(item.id)}
                      className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                    >
                      🎬 이미지 재생성
                    </button>
                    <span className="text-xs text-slate-500">
                      영상 합성/업로드는 GitHub Actions가 자동으로 처리합니다.
                    </span>
                  </div>
                ) : null}
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void handleYoutubeDelete(item.id)}
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
                {item.reject_reason ? (
                  <p className="mt-2 text-xs text-red-700">반려 이유: {item.reject_reason}</p>
                ) : null}
                <p className="mt-2 text-xs text-slate-400">생성: {formatDate(item.created_at)}</p>

                {["draft", "pending", "pending_approval", "review_required"].includes(item.status) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleKakao(item.id, "approve")}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      승인 (카카오로 발행 알림 전송)
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleKakao(item.id, "reject")}
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
                    onClick={() => void handleKakao(item.id, "delete")}
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

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">블로그 에디터 펜 — 블로그 글</h2>
        <ul className="mt-4 space-y-3">
          {data.blogPosts.length === 0 ? (
            <li className="text-sm text-slate-500">블로그 글이 없습니다.</li>
          ) : (
            data.blogPosts.map((item) => (
              <li key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                  <StatusBadge status={item.status} />
                </div>
                {item.excerpt ? <p className="mt-2 text-xs text-slate-600">{item.excerpt}</p> : null}
                {item.keywords?.length ? (
                  <p className="mt-2 text-xs text-slate-400">키워드: {item.keywords.join(", ")}</p>
                ) : null}
                {item.content ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-500">본문 보기</summary>
                    <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                      {item.content}
                    </div>
                  </details>
                ) : null}
                {item.status === "published" ? (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-700">
                    게시됨:{" "}
                    <a className="font-semibold underline" href={`/blog/${item.slug}`} target="_blank" rel="noreferrer">
                      /blog/{item.slug}
                    </a>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                      조회수 {item.view_count}
                    </span>
                  </p>
                ) : null}
                {item.reject_reason ? (
                  <p className="mt-2 text-xs text-red-700">반려 이유: {item.reject_reason}</p>
                ) : null}
                <p className="mt-2 text-xs text-slate-400">생성: {formatDate(item.created_at)}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {["draft", "pending_approval", "pending", "review_required"].includes(item.status) ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void handleBlog(item.id, "approve")}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        승인 (블로그에 발행)
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void handleBlog(item.id, "reject")}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        반려
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void handleBlog(item.id, "delete")}
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

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">네이버 트렌드 키워드</h2>
          <button
            type="button"
            onClick={() => void triggerNaverCollect()}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
          >
            지금 수집
          </button>
        </div>
        {data.trendKeywords.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            수집된 키워드가 없습니다. <code className="rounded bg-slate-100 px-1">NAVER_CLIENT_ID</code>/
            <code className="rounded bg-slate-100 px-1">NAVER_CLIENT_SECRET</code> 설정 후 수집을 실행하세요.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.trendKeywords.map((kw) => (
              <li key={kw} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {kw}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
        <h2 className="font-bold text-slate-800">운영 루프</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>월요일 09:00 — 콘텐츠 기획 (네이버 트렌드 + 6인 경영진 인사이트 반영)</li>
          <li>화요일 09:00 — 유튜브 스크립트/카카오 포스트/블로그 본문 초안 생성</li>
          <li>수요일 08:00 — 승인 대기 알림 (카카오 메모)</li>
          <li>대장이 이 화면에서 승인/반려 → 승인 시 실제 채널/블로그에 발행</li>
        </ol>
      </section>
    </div>
  );
}
