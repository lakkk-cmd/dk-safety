import type { Metadata } from "next";
import VideoJobsClient from "@/components/hq/video-jobs-client";

export const metadata: Metadata = {
  title: "영상 승인 | AI 사령부",
};

export const dynamic = "force-dynamic";

// dk-video-factory 승인 대시보드 — 로컬 워커가 렌더한 영상(pending_review)을
// 대장이 미리보고 승인/반려한다. 승인 없이 유튜브에 올라가는 경로는 없다.
export default function HqVideosPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="mb-1 text-xl font-extrabold text-cc-navy">🎬 영상 승인</h1>
      <p className="mb-6 text-sm text-gray-500">
        에이전트가 제작한 영상을 검토하세요. 승인해야만 유튜브 업로드가 진행됩니다.
      </p>
      <VideoJobsClient />
    </div>
  );
}
