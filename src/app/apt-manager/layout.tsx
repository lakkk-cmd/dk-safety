import type { Metadata } from "next";

/**
 * login/signup/pending/(dashboard) 전부를 감싸는 공통 metadata — title/icons는 이 서브트리에서
 * 정상적으로 덮어써지지만(Next.js Metadata API), manifest 필드는 하위 세그먼트에서 재선언해도
 * 루트값("/manifest.webmanifest")을 계속 쓰는 문제가 있다(2026-08-28 확인, Next 15.5). 그래서
 * 아래 컴포넌트에서 직접 <link rel="manifest"> 태그를 렌더링해 우회한다 — 루트 레이아웃도
 * metadata.manifest로 자기 태그를 렌더링하지만, 브라우저는 문서에 rel="manifest" 링크가
 * 여러 개면 첫 번째 것만 쓰므로(Chromium 계열 표준 동작), 이 레이아웃의 태그가 항상 먼저
 * 렌더링되는 한(실측 확인됨) 정상 동작한다. 요청 host를 확인하는 방식(headers())은 루트
 * 레이아웃 전체를 동적 렌더링으로 만들어 사이트 전체의 정적 페이지들이 전부 영향받으므로
 * 채택하지 않았다 — 이 방식은 apt-manager 서브트리에만 비용이 든다.
 */
export const metadata: Metadata = {
  title: "우리집 안심전기",
  description: "세대전기점검(직무고시) 전기과장 전용 앱",
  icons: {
    icon: "/apt-manager-icon.png",
    apple: "/apt-manager-icon.png"
  }
};

export default function AptManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="manifest" href="/apt-manager-manifest.webmanifest" />
      {children}
    </>
  );
}
