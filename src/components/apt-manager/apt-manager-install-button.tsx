"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** 주소창 설치 아이콘은 눈에 잘 안 띄어서(2026-08-28), 대시보드 헤더에 별도 버튼을 둔다.
 *  이미 설치했거나 브라우저가 설치를 지원하지 않으면(Safari 등) 아무것도 렌더링하지 않는다. */
export default function AptManagerInstallButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !installEvent) return null;

  const install = async () => {
    const event = installEvent;
    setInstallEvent(null);
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
  };

  return (
    <button
      type="button"
      onClick={() => void install()}
      className="rounded-full border border-dk-blue bg-dk-blue/10 px-3 py-1.5 text-xs font-bold text-dk-blue hover:bg-dk-blue/20"
    >
      💻 PC에 설치하기
    </button>
  );
}
