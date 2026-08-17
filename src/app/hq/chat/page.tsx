import HqChatClient from "./chat-client";

export const dynamic = "force-dynamic";

// AI 채팅 전용 페이지 (2026-08: 홈에서 분리 — 홈은 요약 대시보드, 여기가 채팅 전용 화면).
export default function HqChatPage() {
  return <HqChatClient />;
}
