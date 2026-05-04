import { cookies } from "next/headers";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

export async function getWorkerIdFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  return session?.workerId ?? null;
}
