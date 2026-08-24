import { redirect } from "next/navigation";

// 2026-08-24: 세대전기점검(직무고시)을 고객(접수,예약총괄)관리(/admin/customers "직무고시별 보기" 탭)로 통합.
export default function AdminUnitInspectionsPage() {
  redirect("/admin/customers?view=unit-inspection");
}
