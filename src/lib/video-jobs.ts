import { requireAgentSupabase } from "@/lib/agent-db";
import { appendToRaw } from "@/lib/append-to-raw";

// dk-video-factory 영상 작업 큐 (video_jobs, migration 063) — 로컬 PC 워커가 생산,
// 여기서는 hq 승인 대시보드용 조회 + 승인/반려만 다룬다.
// 승인 게이트: 상태 전환은 반드시 pending_review에서만 시작한다 (조건부 UPDATE로 강제).

export type VideoJobStatus =
  | "queued"
  | "scripting"
  | "rendering"
  | "pending_review"
  | "approved"
  | "uploading"
  | "published"
  | "rejected"
  | "error";

export type VideoJobScene = {
  compositionId: string;
  props: Record<string, unknown>;
  narration?: string | null;
  durationInFrames?: number;
  audio?: string;
};

export type VideoJob = {
  id: string;
  created_at: string;
  requested_by: string;
  topic: string;
  format: string;
  script: {
    title?: string;
    description?: string;
    tags?: string[];
    scenes?: VideoJobScene[];
  } | null;
  scenes: VideoJobScene[] | null;
  video_path: string | null;
  validation: { score?: number; issues?: string[] } | null;
  status: VideoJobStatus;
  review_note: string | null;
  youtube_url: string | null;
  error: string | null;
};

const COLUMNS =
  "id, created_at, requested_by, topic, format, script, scenes, video_path, validation, status, review_note, youtube_url, error";

export async function listVideoJobs(limit = 30): Promise<VideoJob[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("video_jobs")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as VideoJob[];
}

/** 승인 — pending_review 상태인 행만 approved로 전환 (다른 상태면 실패) */
export async function approveVideoJob(id: string): Promise<VideoJob> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("video_jobs")
    .update({ status: "approved", review_note: null })
    .eq("id", id)
    .eq("status", "pending_review")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("승인 대기(pending_review) 상태의 작업이 아닙니다.");
  return data as VideoJob;
}

/** 반려 — 사유 필수, pending_review 상태인 행만 rejected로 전환 */
export async function rejectVideoJob(id: string, note: string): Promise<VideoJob> {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("반려 사유를 입력해 주세요.");
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("video_jobs")
    .update({ status: "rejected", review_note: trimmed })
    .eq("id", id)
    .eq("status", "pending_review")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("승인 대기(pending_review) 상태의 작업이 아닙니다.");
  const job = data as VideoJob;
  appendToRaw(
    "video",
    `## 영상 반려: ${job.topic}\n\n- job id: ${job.id}\n- 반려 사유: ${trimmed}`,
    job.topic,
  ).catch((e) => console.error("[append-to-raw] 영상 반려 기록 실패:", e));
  return job;
}
