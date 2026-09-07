"use client";

import { useEffect, useRef } from "react";
import { loadDaumPostcodeScript, type DaumPostcodeResult } from "@/lib/daum-postcode-client";

/**
 * 다음 우편번호 검색을 별도 팝업창(.open())이 아니라 현재 화면 안에 그대로 끼워넣는다(embed).
 * 모바일 웹뷰/PWA에서 .open()이 앱과 분리된 컨텍스트로 열려 두 가지 문제가 실제로 발생했다
 * (2026-09-07 제보): (1) 주소를 눌러도 원래 화면에 선택 결과가 반영되지 않음, (2) 검색창 자체에
 * 뒤로가기 버튼이 없어 휴대폰 뒤로가기를 누르면 앱이 통째로 종료됨. embed 방식은 같은 페이지
 * 안에서 열리므로 (1)이 원천적으로 해소되고, 여기서 직접 만든 "닫기" 버튼과 히스토리 항목으로
 * (2)도 해결한다 — 뒤로가기를 누르면 앱이 아니라 이 검색창만 닫힌다.
 */
export function DaumPostcodeModal({
  open,
  onComplete,
  onClose,
}: {
  open: boolean;
  onComplete: (data: DaumPostcodeResult) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    // 히스토리에 항목을 하나 쌓아, 휴대폰 뒤로가기가 앱 종료/이전 화면 이동이 아니라
    // 이 검색창을 닫는 동작으로 소비되게 한다.
    window.history.pushState({ daumPostcodeModal: true }, "");
    const handlePopState = () => onCloseRef.current();
    window.addEventListener("popstate", handlePopState);

    let cancelled = false;
    void (async () => {
      try {
        await loadDaumPostcodeScript();
        if (cancelled || !containerRef.current) return;
        new window.daum!.Postcode({
          oncomplete: (data) => {
            onCompleteRef.current(data);
            window.history.back(); // popstate → onClose, 위 pushState와 짝을 맞춰 히스토리를 깔끔하게 유지
          },
          width: "100%",
          height: "100%",
        }).embed(containerRef.current);
      } catch {
        onCloseRef.current();
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-white">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-bold text-slate-900">주소 검색</span>
        <button
          type="button"
          onClick={() => window.history.back()}
          aria-label="닫기"
          className="rounded-full p-1.5 text-lg leading-none text-slate-500 hover:bg-slate-100"
        >
          ✕
        </button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
