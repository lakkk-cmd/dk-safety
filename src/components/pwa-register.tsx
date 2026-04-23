"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // 등록 실패 시 앱 사용에는 영향이 없도록 무시합니다.
    });
  }, []);

  return null;
}
