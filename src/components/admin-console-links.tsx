import Link from "next/link";
import { cn } from "@/lib/utils";

type SectionKey =
  | "main"
  | "customers"
  | "reservations"
  | "apartments"
  | "payment-settings"
  | "dispatch-fee"
  | "workers"
  | "backups";

const items: Array<{ key: SectionKey; label: string; href: string }> = [
  { key: "main", label: "메인화면", href: "/admin/home" },
  { key: "customers", label: "고객관리", href: "/admin/customers" },
  { key: "reservations", label: "예약/정산", href: "/admin/reservations" },
  { key: "apartments", label: "아파트 관리", href: "/admin/apartments" },
  { key: "workers", label: "기사 관리", href: "/admin/technicians" },
  { key: "payment-settings", label: "결제 계좌 설정", href: "/admin/payment-settings" },
  { key: "dispatch-fee", label: "기본 출장비", href: "/admin/base-dispatch-fee" },
  { key: "backups", label: "백업 관리", href: "/admin/backups" }
];

type Props = {
  active?: SectionKey;
  mode?: "chips" | "sidebar";
};

export default function AdminConsoleLinks({ active, mode = "chips" }: Props) {
  if (mode === "sidebar") {
    return (
      <nav className="dk-admin-sidebar-links">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`block rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              active === item.key
                ? "border-primary bg-primary text-white"
                : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className={cn("dk-admin-chips", "flex flex-wrap gap-2")}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
            active === item.key
              ? "border-primary bg-primary text-white"
              : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
