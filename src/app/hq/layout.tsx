"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import HqShell from "@/components/hq/hq-shell";

export default function HqLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/hq/login" || pathname === "/login";

  if (isLoginPage) {
    return <div className="flex min-h-screen items-center justify-center bg-cc-bg p-4">{children}</div>;
  }

  return <HqShell>{children}</HqShell>;
}
