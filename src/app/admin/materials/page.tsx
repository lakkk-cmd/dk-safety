import { redirect } from "next/navigation";

// 2026-07-19: 요금/단가표(/admin/pricing)의 "재료비 카탈로그" 탭으로 통합.
export default function AdminMaterialsPage() {
  redirect("/admin/pricing?tab=materials");
}
