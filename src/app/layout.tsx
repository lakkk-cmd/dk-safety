import type { Metadata, Viewport } from "next";
import "./globals.css";
import GlobalResidentLogoutButton from "@/components/global-resident-logout-button";
import PwaRegister from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "우리집 전기주치의(대경이엔피)",
  description: "가정 전기 점검, 누전/차단기/배선 점검을 쉽고 빠르게 예약하세요.",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <PwaRegister />
        {children}
        <GlobalResidentLogoutButton />
      </body>
    </html>
  );
}
