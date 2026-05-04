import { redirect } from "next/navigation";

export default async function ResidentLoginPage({
  searchParams
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const next = params.next?.trim();
  if (next && next.startsWith("/apt/")) {
    redirect(next);
  }
  redirect("/home");
}
