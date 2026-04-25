import Link from "next/link";

type SectionKey = "reservations" | "payment-settings" | "workers" | "activity-logs" | "backups";

const items: Array<{ key: SectionKey; label: string; href: string }> = [
  { key: "reservations", label: "예약/정산", href: "/admin/reservations" },
  { key: "payment-settings", label: "결제 계좌 설정", href: "/admin/payment-settings" },
  { key: "workers", label: "기사 등록", href: "/admin/workers" },
  { key: "activity-logs", label: "활동 로그", href: "/admin/activity-logs" },
  { key: "backups", label: "백업 상태", href: "/admin/backups" }
];

type Props = {
  active?: SectionKey;
  mode?: "chips" | "sidebar";
};

export default function AdminConsoleLinks({ active, mode = "chips" }: Props) {
  if (mode === "sidebar") {
    return (
      <nav className="space-y-2">
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
    <nav className="mt-4 flex flex-wrap gap-2">
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
