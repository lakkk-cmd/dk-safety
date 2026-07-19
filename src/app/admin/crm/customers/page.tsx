import { redirect } from "next/navigation";

// 2026-07-19: 고객별 보기(전화번호 단위)를 예약별 보기(/admin/customers)와 한 화면의 탭으로 통합.
export default function AdminCrmCustomersPage() {
  redirect("/admin/customers?view=crm");
}
