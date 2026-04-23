import { cookies } from "next/headers";
import { ADMIN_AUTH_COOKIE } from "@/lib/site-config";

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_AUTH_COOKIE)?.value === "ok";
}
