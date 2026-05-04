"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMobileNavDirection } from "@/components/mobile/mobile-nav-provider";

export default function TenantPageHeader({ title }: { title: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { setBackward } = useMobileNavDirection();
  const canGoBack = !/\/apt\/[^/]+$/.test(pathname);
  const titleLength = title.replaceAll(/\s/g, "").length;
  const titleSizeClass = titleLength >= 20 ? "text-[13px]" : titleLength >= 16 ? "text-sm" : "text-base";

  return (
    <header className="sticky top-0 z-30 border-b border-[#e8dfd6]/90 bg-gradient-to-r from-[#fffefb] via-[#fdf8f4] to-[#f4f9f6] px-4 py-3 text-[#2c2825] shadow-[0_1px_0_rgba(44,40,37,0.04)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
        {canGoBack ? (
          <button
            type="button"
            onClick={() => {
              setBackward();
              router.back();
            }}
            className="rounded-full border border-[#e0d6ce] bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#4d4039] shadow-sm transition hover:border-[#cf6b4e]/35 hover:bg-[#fff9f6]"
          >
            뒤로가기
          </button>
        ) : (
          <span className="w-[82px]" />
        )}
        <p className={`min-w-0 flex-1 whitespace-nowrap text-center font-extrabold tracking-tight text-[#2c2825] ${titleSizeClass}`}>
          {title}
        </p>
        <span className="w-[82px]" />
      </div>
    </header>
  );
}
