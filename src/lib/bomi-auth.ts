import { cookies } from "next/headers";
import { BOMI_AUTH_COOKIE } from "@/lib/site-config";

export async function isBomiAuthenticated() {
  const cookieStore = await cookies();
  return cookieStore.get(BOMI_AUTH_COOKIE)?.value === "ok";
}
