import HomeClient from "@/components/home/home-client";
import { pgListApartments } from "@/lib/apartments-pg";

export default async function MainHomePage() {
  const apartments = await pgListApartments()
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        apt_code: row.code,
        logo_url: row.logoUrl
      }))
    )
    .catch(() => []);

  return <HomeClient apartments={apartments} />;
}
