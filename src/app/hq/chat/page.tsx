import { redirect } from "next/navigation";

// AI채팅이 hq 홈(/)으로 승격되면서 이 경로는 홈으로 리다이렉트된다 (기존 북마크/링크 유지용).
export default function HqChatPage() {
  redirect("/");
}
