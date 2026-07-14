import type { Metadata } from "next";
import type { ReactNode } from "react";
import BomiShell from "./bomi-shell";

export const metadata: Metadata = {
  title: "보미 | 보험설계사 CRM"
};

export default function BomiLayout({ children }: { children: ReactNode }) {
  return <BomiShell>{children}</BomiShell>;
}
