import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminBackupsPage() {
  redirect("/admin/reservations");
}
