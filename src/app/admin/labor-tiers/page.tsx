import { redirect } from "next/navigation";

// 2026-07-19: 요금/단가표(/admin/pricing)의 "작업비 난이도 정액표" 탭으로 통합.
export default function AdminLaborTiersPage() {
  redirect("/admin/pricing?tab=labor-tiers");
}
