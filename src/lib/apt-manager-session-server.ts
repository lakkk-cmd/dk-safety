import { cookies } from "next/headers";
import { APT_MANAGER_AUTH_COOKIE } from "@/lib/site-config";
import { verifyApartmentManagerSessionToken } from "@/lib/apt-manager-auth";

export async function getApartmentManagerIdFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = verifyApartmentManagerSessionToken(cookieStore.get(APT_MANAGER_AUTH_COOKIE)?.value);
  return session?.managerId ?? null;
}
