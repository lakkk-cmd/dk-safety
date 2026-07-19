import { redirect } from "next/navigation";

// 2026-07-19: 작업자관리(단가·전문분야)를 기사/인증 관리(PIN·배정)와 한 화면으로 통합.
export default function AdminErpWorkersPage() {
  redirect("/admin/technicians");
}
