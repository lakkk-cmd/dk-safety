import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgListAdminCustomerCareRows } from "@/lib/admin-customer-care";
import { pgListApartments } from "@/lib/apartments-pg";
import type { AdminOrderRow } from "@/lib/orders-pg";
import { pgListOrdersForAdmin } from "@/lib/orders-pg";
import { readPricingCatalog } from "@/lib/pricing-catalog";
import { pgListWorkers } from "@/lib/reservations-pg";
import { requireSupabaseAdmin, isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

type QuickSearchHit = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

function orderSearchText(o: AdminOrderRow): string {
  const r = (o.resident_info as Record<string, unknown> | null) ?? {};
  const name = String(r.name ?? "");
  const phone = String(r.phone ?? "").replaceAll(/\s/g, "");
  const dong = String(r.dong ?? "");
  const ho = String(r.ho ?? "");
  const parts = [
    o.id,
    o.reservation_id ?? "",
    name,
    phone,
    dong,
    ho,
    o.virtual_account_number ?? "",
    o.virtual_account_holder ?? "",
    o.payment_status,
    o.dispatch_status,
    o.final_payment_status ?? ""
  ];
  return norm(parts.join(" "));
}

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "";
  const qRaw = searchParams.get("q") ?? "";
  const q = norm(qRaw).replace(/%/g, "").slice(0, 80);
  if (!q) {
    return NextResponse.json({ results: [] as QuickSearchHit[] });
  }

  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ results: [], message: "Supabase DB 모드가 아닙니다." });
  }

  const limit = 10;
  const results: QuickSearchHit[] = [];

  try {
    if (scope === "apartments") {
      const list = await pgListApartments();
      for (const a of list) {
        if (results.length >= limit) break;
        const blob = norm(`${a.name} ${a.code} ${a.bankInfo.accountNumber}`);
        if (!blob.includes(q)) continue;
        results.push({
          id: a.id,
          title: a.name,
          subtitle: `코드 ${a.code} · 기본 ${a.baseFee.toLocaleString("ko-KR")}원`,
          href: "/admin/apartments"
        });
      }
    } else if (scope === "pricing") {
      const lines = await readPricingCatalog();
      for (const line of lines) {
        if (results.length >= limit) break;
        const blob = norm(`${line.key} ${line.title} ${line.detail}`);
        if (!blob.includes(q)) continue;
        const amt = line.amount == null ? "협의/별도" : `${line.amount.toLocaleString("ko-KR")}원`;
        results.push({
          id: line.key,
          title: line.title,
          subtitle: `${amt} · ${line.key}`,
          href: "/admin/pricing"
        });
      }
    } else if (scope === "finance" || scope === "dispatch" || scope === "billing") {
      const orders = (await pgListOrdersForAdmin()).slice(0, 500);
      for (const o of orders) {
        if (results.length >= limit) break;
        const blob = orderSearchText(o);
        if (!blob.includes(q)) continue;
        if (scope === "dispatch") {
          if (o.payment_status !== "PAID") continue;
        }
        if (scope === "billing") {
          const fp = String(o.final_payment_status ?? "").toUpperCase();
          const hasSettlement =
            (typeof o.total_final_fee === "number" && o.total_final_fee > 0) || ["REQUESTED", "PAID", "FAILED"].includes(fp);
          if (!hasSettlement) continue;
        }
        const r = (o.resident_info as Record<string, unknown> | null) ?? {};
        const who = String(r.name ?? "고객");
        const unit = [r.dong, r.ho].filter(Boolean).join("·") || "동·호";
        const subtitle = `${who} · ${unit} · ${o.payment_status}/${o.dispatch_status} · 예약 ${(o.reservation_id ?? "-").toString().slice(0, 8)}…`;
        const href =
          scope === "finance" ? "/admin/finance" : scope === "dispatch" ? "/admin/dispatch" : "/admin/billing";
        results.push({
          id: o.id,
          title: `주문 ${o.id.slice(0, 8)}…`,
          subtitle,
          href
        });
      }
    } else if (scope === "warranties") {
      const supabase = requireSupabaseAdmin();
      const { data, error } = await supabase
        .from("warranties")
        .select("id, warranty_number, warranty_no, reservation_id, issued_at, verify_url")
        .order("issued_at", { ascending: false })
        .limit(250);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        if (results.length >= limit) break;
        const rec = row as {
          id: string;
          warranty_number: string | null;
          warranty_no: string | null;
          reservation_id: string | null;
          issued_at: string | null;
          verify_url: string | null;
        };
        const num = rec.warranty_no ?? rec.warranty_number ?? "";
        const blob = norm(`${num} ${rec.reservation_id ?? ""}`);
        if (!blob.includes(q)) continue;
        results.push({
          id: rec.id,
          title: num || "보증서",
          subtitle: `예약 ${rec.reservation_id ?? "-"} · ${rec.issued_at?.slice(0, 10) ?? "-"}`,
          href: rec.verify_url && rec.verify_url.startsWith("http") ? rec.verify_url : `/admin/warranties`
        });
      }
    } else if (scope === "technicians") {
      const workers = await pgListWorkers();
      for (const w of workers) {
        if (results.length >= limit) break;
        const blob = norm(`${w.name} ${w.phone} ${w.id}`);
        if (!blob.includes(q)) continue;
        results.push({
          id: w.id,
          title: w.name,
          subtitle: `${w.phone} · ${w.active ? "활성" : "비활성"}`,
          href: "/admin/technicians"
        });
      }
    } else if (scope === "customers") {
      const rows = await pgListAdminCustomerCareRows();
      for (const r of rows) {
        if (results.length >= limit) break;
        const blob = norm(
          `${r.reservationId} ${r.name} ${r.phone} ${r.address} ${r.apartmentCode ?? ""} ${r.apartmentName ?? ""} ${r.serviceType} ${r.orderId ?? ""} ${r.virtualAccountNumber ?? ""}`
        );
        if (!blob.includes(q)) continue;
        results.push({
          id: r.reservationId,
          title: `${r.name} (${r.phone})`,
          subtitle: `${r.apartmentName ?? "-"} · ${r.status} · 주문 ${r.orderPaymentStatus ?? "-"}`,
          href: `/admin/reservations?id=${encodeURIComponent(r.reservationId)}`
        });
      }
    } else if (scope === "electrical-tips") {
      const supabase = requireSupabaseAdmin();
      const { data, error } = await supabase
        .from("electrical_tips")
        .select("id, title, summary, content, category, is_published, display_order")
        .order("display_order", { ascending: true })
        .limit(250);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        if (results.length >= limit) break;
        const rec = row as {
          id: string;
          title: string;
          summary: string;
          content: string;
          category: string | null;
          is_published: boolean | null;
          display_order: number | null;
        };
        const blob = norm(`${rec.title} ${rec.summary} ${rec.content} ${rec.category ?? ""}`);
        if (!blob.includes(q)) continue;
        results.push({
          id: rec.id,
          title: rec.title,
          subtitle: `${rec.category ?? "-"} · ${rec.is_published ? "공개" : "초안"} · 순서 ${rec.display_order ?? 0}`,
          href: "/admin/electrical-tips"
        });
      }
    } else {
      return NextResponse.json({ message: "지원하지 않는 검색 범위입니다." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "검색 실패";
    return NextResponse.json({ message, results: [] }, { status: 500 });
  }

  return NextResponse.json({ results });
}
