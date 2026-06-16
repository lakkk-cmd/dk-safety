import type { Metadata } from "next";
import HqChatClient from "./chat-client";

export const metadata: Metadata = {
  title: "AI 채팅 | 대경안심전기",
};

export default function HqChatPage() {
  return <HqChatClient />;
}
