import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import GlobalQuickActions from "@/components/global-quick-actions";
import GlobalResidentLogoutButton from "@/components/global-resident-logout-button";
import PwaRegister from "@/components/pwa-register";

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "대경안심전기 | 우리 집 전기 주치의",
  description: "가정 전기 점검, 누전/차단기/배선 점검을 쉽고 빠르게 예약하세요.",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${notoSansKr.className} pb-24 md:pb-0`}>
        <PwaRegister />
        {children}
        <GlobalResidentLogoutButton />
        <GlobalQuickActions />
      </body>
    </html>
  );
}
