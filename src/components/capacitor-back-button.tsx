"use client";

import { useEffect } from "react";

type CapacitorAppPlugin = {
  addListener: (
    eventName: "backButton",
    listener: (state: { canGoBack: boolean }) => void
  ) => Promise<{ remove: () => void }>;
  exitApp: () => void;
};

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: { App?: CapacitorAppPlugin };
    };
  }
}

/**
 * 모바일 앱(mobile/{admin,worker,customer,apt-manager}-app, Capacitor WebView) 전용
 * 하드웨어/제스처 뒤로가기 처리. window.Capacitor는 앱 안에서만 존재하므로 일반 웹브라우저
 * 방문자에게는 아무 영향이 없다.
 *
 * 2026-09-08 발견: 4개 앱 전부 @capacitor/app 플러그인이 설치돼 있지 않아 하드웨어 back
 * 버튼을 가로채는 코드가 아예 없었다 — Capacitor 8부터는 이 처리를 프레임워크가 자동으로
 * 해주지 않아서, 지금까지는 어느 페이지에서든 뒤로가기 = 시스템 기본 동작(액티비티 종료,
 * 즉 앱 종료)이었다. mobile/*\/package.json에 @capacitor/app을 추가해 네이티브 쪽에서
 * back 키 가로채기 자체가 가능해지고, 여기서 canGoBack이면 웹뷰 히스토리를 뒤로,
 * 최상위(canGoBack=false)면 앱을 종료하도록 연결한다.
 */
export default function CapacitorBackButton() {
  useEffect(() => {
    const capacitor = window.Capacitor;
    if (!capacitor?.isNativePlatform?.()) return;
    const app = capacitor.Plugins?.App;
    if (!app) return;

    let removeListener: (() => void) | null = null;
    let cancelled = false;
    void app
      .addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          app.exitApp();
        }
      })
      .then((handle) => {
        if (cancelled) {
          handle.remove();
        } else {
          removeListener = () => handle.remove();
        }
      });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  return null;
}
