"use client";

import { useCallback, useEffect, useState } from "react";
import type { VideoJob, VideoJobStatus } from "@/lib/video-jobs";

const STATUS_LABELS: Record<VideoJobStatus, string> = {
  queued: "대기",
  scripting: "대본 생성 중",
  rendering: "렌더링 중",
  pending_review: "승인 대기",
  approved: "승인됨 · 업로드 대기",
  uploading: "업로드 중",
  published: "게시 완료",
  rejected: "반려",
  error: "오류",
};

const STATUS_BADGE: Record<VideoJobStatus, string> = {
  queued: "bg-gray-100 text-gray-600",
  scripting: "bg-blue-50 text-blue-700",
  rendering: "bg-blue-50 text-blue-700",
  pending_review: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-50 text-emerald-700",
  uploading: "bg-blue-50 text-blue-700",
  published: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  error: "bg-red-100 text-red-800",
};

function StatusBadge({ status }: { status: VideoJobStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_BADGE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ScriptDetail({ job }: { job: VideoJob }) {
  const [open, setOpen] = useState(false);
  const scenes = job.scenes ?? job.script?.scenes ?? [];
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-semibold text-cc-navy underline underline-offset-2"
      >
        {open ? "대본 접기 ▲" : `대본 전문 보기 (씬 ${scenes.length}개) ▼`}
      </button>
      {open && (
        <ol className="mt-2 space-y-2">
          {scenes.map((scene, i) => (
            <li key={i} className="rounded-xl bg-gray-50 p-3 text-sm">
              <div className="mb-1 font-bold text-cc-navy">
                씬 {i + 1} <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-gray-500">{scene.compositionId}</span>
              </div>
              {scene.narration && <p className="text-gray-700">{scene.narration}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ReviewCard({
  job,
  onAction,
}: {
  job: VideoJob;
  onAction: (id: string, action: "approve" | "reject", note?: string) => Promise<string | null>;
}) {
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: "approve" | "reject") => {
    setBusy(true);
    setMessage(null);
    const err = await onAction(job.id, action, note);
    if (err) setMessage(err);
    setBusy(false);
  };

  const validation = job.validation;

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={job.status} />
        <span className="rounded-full bg-cc-navy px-2.5 py-0.5 text-xs font-bold text-white">
          {job.format === "shorts" ? "쇼츠" : "일반"}
        </span>
        <span className="text-xs text-gray-400">
          {formatDate(job.created_at)} · 요청: {job.requested_by}
        </span>
      </div>

      <h3 className="mt-2 text-lg font-extrabold text-cc-navy">{job.script?.title ?? job.topic}</h3>
      <p className="text-sm text-gray-500">{job.topic}</p>

      <div className="mt-3 flex flex-col gap-4 md:flex-row">
        {job.video_path ? (
          <video
            controls
            playsInline
            preload="metadata"
            src={job.video_path}
            className="w-full max-w-[260px] self-start rounded-xl bg-black"
            style={{ aspectRatio: "9 / 16" }}
          />
        ) : (
          <div className="flex h-40 w-full max-w-[260px] items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">
            영상 없음
          </div>
        )}

        <div className="min-w-0 flex-1">
          {job.script?.description && (
            <p className="whitespace-pre-wrap text-sm text-gray-600">{job.script.description}</p>
          )}

          {validation && (
            <div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm">
              {typeof validation.score === "number" && (
                <div className="font-bold text-cc-navy">검증 점수: {validation.score}/100</div>
              )}
              {(validation.issues?.length ?? 0) > 0 && (
                <ul className="mt-1 list-disc pl-5 text-gray-600">
                  {validation.issues!.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <ScriptDetail job={job} />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("이 영상을 승인할까요? 승인하면 유튜브 업로드 대기 상태가 됩니다.")) {
                  void run("approve");
                }
              }}
              className="rounded-xl bg-cc-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              ✅ 승인
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting((v) => !v)}
              className="rounded-xl border-2 border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-600 disabled:opacity-50"
            >
              반려
            </button>
          </div>

          {rejecting && (
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="반려 사유 (요청 에이전트가 재작업 판단에 사용)"
                rows={2}
                className="w-full rounded-xl border border-gray-200 p-3 text-sm"
              />
              <button
                type="button"
                disabled={busy || !note.trim()}
                onClick={() => void run("reject")}
                className="self-start rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                반려 확정
              </button>
            </div>
          )}

          {message && <p className="mt-2 text-sm font-semibold text-red-600">{message}</p>}
        </div>
      </div>
    </div>
  );
}

export default function VideoJobsClient() {
  const [jobs, setJobs] = useState<VideoJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/video-jobs", { cache: "no-store" });
      const data = (await res.json()) as { items?: VideoJob[]; message?: string };
      if (!res.ok) throw new Error(data.message ?? "조회 실패");
      setJobs(data.items ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const onAction = useCallback(
    async (id: string, action: "approve" | "reject", note?: string) => {
      try {
        const res = await fetch("/api/admin/video-jobs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action, note }),
        });
        const data = (await res.json()) as { message?: string };
        if (!res.ok) throw new Error(data.message ?? "처리 실패");
        await load();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "처리 실패";
      }
    },
    [load]
  );

  if (error) {
    return <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>;
  }
  if (!jobs) {
    return <p className="p-4 text-sm text-gray-400">불러오는 중…</p>;
  }

  const pending = jobs.filter((j) => j.status === "pending_review");
  const inProgress = jobs.filter((j) => ["queued", "scripting", "rendering", "error"].includes(j.status));
  const done = jobs.filter((j) => ["approved", "uploading", "published", "rejected"].includes(j.status));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-base font-extrabold text-cc-navy">
          승인 대기 {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs text-cc-navy">{pending.length}</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl bg-white p-4 text-sm text-gray-400">승인 대기 중인 영상이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {pending.map((job) => (
              <ReviewCard key={job.id} job={job} onAction={onAction} />
            ))}
          </div>
        )}
      </section>

      {inProgress.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-extrabold text-cc-navy">제작 진행 중</h2>
          <div className="space-y-2">
            {inProgress.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 text-sm shadow-sm">
                <StatusBadge status={job.status} />
                <span className="font-semibold text-cc-navy">{job.topic}</span>
                <span className="text-xs text-gray-400">{formatDate(job.created_at)} · {job.requested_by}</span>
                {job.error && <span className="w-full text-xs text-red-500">{job.error}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-extrabold text-cc-navy">처리 완료</h2>
          <div className="space-y-2">
            {done.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 text-sm shadow-sm">
                <StatusBadge status={job.status} />
                <span className="font-semibold text-cc-navy">{job.script?.title ?? job.topic}</span>
                <span className="text-xs text-gray-400">{formatDate(job.created_at)}</span>
                {job.video_path && (
                  <a href={job.video_path} target="_blank" rel="noreferrer" className="text-xs font-semibold text-cc-navy underline">
                    영상 보기
                  </a>
                )}
                {job.youtube_url && (
                  <a href={job.youtube_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-red-600 underline">
                    유튜브
                  </a>
                )}
                {job.review_note && <span className="w-full text-xs text-red-500">반려 사유: {job.review_note}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
