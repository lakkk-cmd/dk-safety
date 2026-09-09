"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * 모바일 앱(Capacitor) 안에서만 보이는 화면상의 뒤로가기 버튼. 브라우저 chrome이 없는
 * 웹뷰 특성상, 헤더/네비게이션이 없는 화면(예: /status)에서는 하드웨어 back 키
 * (capacitor-back-button.tsx)만으로는 "뒤로 갈 수 있다"는 게 눈에 보이지 않는다는
 * 피드백으로 추가함(2026-09-08). 일반 웹브라우저 방문자에게는 표시되지 않는다 —
 * 브라우저는 이미 자체 뒤로가기 버튼이 있어 중복이라 굳이 웹에는 안 띄운다.
 *
 * "뒤로 갈 곳이 있는지"는 pathname이 최초 진입 이후 몇 번 바뀌었는지로 판단한다(4개
 * 앱이 각각 다른 시작 경로(/home, /worker, /admin, /apt-manager/inspect)를 가지므로
 * 특정 경로를 하드코딩하지 않는다) — 세션스토리지 대신 순수 카운터를 쓰는 이유는, 앱을
 * 완전히 새로 켰을 때(진짜 첫 로드) 항상 0부터 시작하도록 보장하기 위함이다.
 *
 * "헤더 없는 화면"인지도 경로를 하드코딩하지 않고, 화면에 실제로 `<header>` 엘리먼트가
 * 있는지 DOM에서 직접 확인한다(2026-09-09) — worker-chrome/apt-manager-chrome 등 자체
 * 헤더가 있는 화면에서 제목 텍스트와 이 버튼이 겹치는 사고가 실제로 발생해서 추가함.
 * 경로 목록을 하드코딩하면 새 화면이 생길 때마다 또 깜빡하고 못 넣을 수 있어, 대신
 * "이미 헤더가 있으면 뜨지 않는다"는 불변 규칙으로 강제한다.
 */
export default function CapacitorBackBar() {
  const pathname = usePathname();
  const [isNative, setIsNative] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [hasOwnHeader, setHasOwnHeader] = useState(true);
  const visitCount = useRef(0);

  useEffect(() => {
    setIsNative(Boolean(window.Capacitor?.isNativePlatform?.()));
  }, []);

  useEffect(() => {
    visitCount.current += 1;
    if (visitCount.current > 1) setCanGoBack(true);
    // 페이지 전환 후 다음 화면이 자기 헤더를 그릴 시간을 준다.
    const id = window.requestAnimationFrame(() => {
      setHasOwnHeader(Boolean(document.querySelector("header")));
    });
    return () => window.cancelAnimationFrame(id);
  }, [pathname]);

  if (!isNative || !canGoBack || hasOwnHeader) return null;

  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      aria-label="뒤로가기"
      className="fixed left-3 top-[calc(0.6rem+env(safe-area-inset-top))] z-[60] flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-xl font-bold text-dk-navy shadow-[0_10px_24px_rgba(15,23,42,0.16)] backdrop-blur"
    >
      ‹
    </button>
  );
}
