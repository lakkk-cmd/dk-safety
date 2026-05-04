import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminWorkersPage() {
  redirect("/admin/reservations");
}
