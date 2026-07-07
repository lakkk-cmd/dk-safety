"use client";

import { useCallback, useEffect, useState } from "react";
import type { BlogJob, BlogJobStatus } from "@/lib/blog-jobs";

const STATUS_LABELS: Record<BlogJobStatus, string> = {
  queued: "대기",
  researching: "키워드 조사 중",
  drafting: "원고 작성 중",
  processing_images: "사진/썸네일 처리 중",
  pending_review: "발행 대기",
  published: "발행 완료",
  rejected: "반려",
  error: "오류",
};

const STATUS_BADGE: Record<BlogJobStatus, string> = {
  queued: "bg-gray-100 text-gray-600",
  researching: "bg-blue-50 text-blue-700",
  drafting: "bg-blue-50 text-blue-700",
  processing_images: "bg-blue-50 text-blue-700",
  pending_review: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  error: "bg-red-100 text-red-800",
};

function StatusBadge({ status }: { status: BlogJobStatus }) {
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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-cc-navy hover:bg-gray-50"
    >
      {copied ? "복사됨 ✓" : label}
    </button>
  );
}

/** 원고 전체를 네이버 에디터 붙여넣기용 일반 텍스트로 */
function draftToPlainText(job: BlogJob): string {
  const d = job.draft;
  if (!d) return "";
  const parts: string[] = [d.title ?? job.topic, ""];
  for (const s of d.sections ?? []) {
    if (s.heading !== "도입" && s.heading !== "마무리") parts.push(`■ ${s.heading}`, "");
    parts.push(s.body);
    if (s.image_marker) parts.push("", `[${s.image_marker}]`);
    parts.push("");
  }
  return parts.join("\n");
}

async function downloadPhotosZip(job: BlogJob) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const urls = job.processed_images ?? [];
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i]);
    zip.file(`사진${i + 1}.jpg`, await res.blob());
  }
  if (job.thumbnail_url) {
    const res = await fetch(job.thumbnail_url);
    zip.file("썸네일.png", await res.blob());
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `blog-${job.id.slice(0, 8)}-photos.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function PackageCard({
  job,
  onAction,
}: {
  job: BlogJob;
  onAction: (id: string, action: "publish" | "reject", value: string) => Promise<string | null>;
}) {
  const [publishedUrl, setPublishedUrl] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"none" | "publish" | "reject">("none");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);

  const run = async (action: "publish" | "reject", value: string) => {
    setBusy(true);
    setMessage(null);
    const err = await onAction(job.id, action, value);
    if (err) setMessage(err);
    setBusy(false);
  };

  const kw = job.keyword_research;
  const validation = job.validation;
  const sections = job.draft?.sections ?? [];
  const tags = job.draft?.tags ?? [];
  const tagText = tags.join(", ");

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={job.status} />
        <span className="text-xs text-gray-400">
          {formatDate(job.created_at)} · 요청: {job.requested_by}
        </span>
        {kw?.main && (
          <span className="rounded-full bg-cc-navy px-2.5 py-0.5 text-xs font-bold text-white">
            🔑 {kw.main} (월 {kw.volume ?? "?"}회 · 경쟁 {kw.competition ?? "?"}{kw.source === "mock" ? " · mock" : ""})
          </span>
        )}
        {typeof validation?.score === "number" && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${validation.score >= 80 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            검증 {validation.score}점
          </span>
        )}
      </div>

      <h3 className="mt-2 text-lg font-extrabold text-cc-navy">{job.draft?.title ?? job.topic}</h3>
      <p className="text-sm text-gray-500">{job.topic}</p>

      <div className="mt-3 flex flex-col gap-4 md:flex-row">
        <div className="flex w-full max-w-[220px] flex-col gap-2 self-start">
          {job.thumbnail_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={job.thumbnail_url} alt="썸네일" className="w-full rounded-xl border border-gray-100" />
              <a
                href={job.thumbnail_url}
                target="_blank"
                rel="noreferrer"
                className="text-center text-xs font-bold text-cc-navy underline"
              >
                썸네일 원본 열기
              </a>
            </>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">썸네일 없음</div>
          )}

          {(job.processed_images?.length ?? 0) > 0 && (
            <>
              <div className="grid grid-cols-2 gap-1">
                {job.processed_images!.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt={`사진${i + 1}`} className="rounded-lg border border-gray-100" />
                ))}
              </div>
              <button
                type="button"
                disabled={zipBusy}
                onClick={async () => {
                  setZipBusy(true);
                  try {
                    await downloadPhotosZip(job);
                  } finally {
                    setZipBusy(false);
                  }
                }}
                className="rounded-xl bg-cc-navy px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {zipBusy ? "압축 중…" : `📦 사진 ${job.processed_images!.length}장 + 썸네일 zip`}
              </button>
            </>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <CopyButton text={draftToPlainText(job)} label="📋 원고 전체 복사" />
            <CopyButton text={tagText} label={`# 태그 ${tags.length}개 복사`} />
          </div>

          <div className="max-h-96 space-y-2 overflow-y-auto rounded-xl bg-gray-50 p-3">
            {sections.map((s, i) => (
              <div key={i} className="rounded-lg bg-white p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-cc-navy">
                    {s.heading}
                    {s.image_marker && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">📷 {s.image_marker} 삽입</span>}
                  </span>
                  <CopyButton text={s.body} label="복사" />
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{s.body}</p>
              </div>
            ))}
          </div>

          {(validation?.issues?.length ?? 0) > 0 && (
            <details className="mt-2 rounded-xl bg-gray-50 p-3 text-sm">
              <summary className="cursor-pointer font-bold text-cc-navy">검증 지적 사항 {validation!.issues!.length}건</summary>
              <ul className="mt-1 list-disc pl-5 text-gray-600">
                {validation!.issues!.map((issue, i) => (
                  <li key={i}>{typeof issue === "string" ? issue : JSON.stringify(issue)}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode(mode === "publish" ? "none" : "publish")}
              className="rounded-xl bg-cc-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              ✅ 발행 완료
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode(mode === "reject" ? "none" : "reject")}
              className="rounded-xl border-2 border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-600 disabled:opacity-50"
            >
              반려
            </button>
          </div>

          {mode === "publish" && (
            <div className="mt-3 flex flex-col gap-2">
              <input
                value={publishedUrl}
                onChange={(e) => setPublishedUrl(e.target.value)}
                placeholder="네이버에 발행한 글 URL (https://blog.naver.com/…)"
                className="w-full rounded-xl border border-gray-200 p-3 text-sm"
              />
              <button
                type="button"
                disabled={busy || !/^https?:\/\//.test(publishedUrl.trim())}
                onClick={() => void run("publish", publishedUrl)}
                className="self-start rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                발행 URL 기록
              </button>
            </div>
          )}

          {mode === "reject" && (
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
                onClick={() => void run("reject", note)}
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

export default function BlogJobsClient() {
  const [jobs, setJobs] = useState<BlogJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/blog-jobs", { cache: "no-store" });
      const data = (await res.json()) as { items?: BlogJob[]; message?: string };
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
    async (id: string, action: "publish" | "reject", value: string) => {
      try {
        const res = await fetch("/api/admin/blog-jobs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "publish" ? { id, action, published_url: value } : { id, action, note: value }
          ),
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
  const inProgress = jobs.filter((j) =>
    ["queued", "researching", "drafting", "processing_images", "error"].includes(j.status)
  );
  const done = jobs.filter((j) => ["published", "rejected"].includes(j.status));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-base font-extrabold text-cc-navy">
          발행 대기{" "}
          {pending.length > 0 && (
            <span className="ml-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs text-cc-navy">{pending.length}</span>
          )}
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl bg-white p-4 text-sm text-gray-400">발행 대기 중인 원고가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {pending.map((job) => (
              <PackageCard key={job.id} job={job} onAction={onAction} />
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
                <span className="font-semibold text-cc-navy">{job.draft?.title ?? job.topic}</span>
                <span className="text-xs text-gray-400">{formatDate(job.created_at)}</span>
                {job.published_url && (
                  <a href={job.published_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700 underline">
                    발행된 글 보기
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
