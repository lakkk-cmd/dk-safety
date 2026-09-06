import KakaoApprovalPanel from "@/components/hq/kakao-approval-panel";

export const dynamic = "force-dynamic";

/** 카카오 채널 포스트 승인 전용 — hq 안에서 카카오 콘텐츠만 승인 가능하게 한다(2026-09-06).
 *  유튜브·블로그는 여기 나타나지 않는다 — 그건 각각 /hq/videos·/hq/blog-jobs 소관. */
export default function KakaoApprovalPage() {
  return <KakaoApprovalPanel />;
}
