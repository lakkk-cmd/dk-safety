"use client";

import { usePathname } from "next/navigation";

/** 페이지 전환 시 subtree 재마운트로 상태 초기화 — framer-motion 제거(Windows/Webpack vendor chunk 오류 방지). */
export default function MobilePageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="w-full">
      {children}
    </div>
  );
}
