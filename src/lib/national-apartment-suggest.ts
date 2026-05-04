import { nationalApartmentCatalog, type NationalApartmentItem } from "@/lib/national-apartment-catalog";
import { getSupabaseAdmin, usesSupabaseReservationsDb } from "@/lib/supabase-pg";

let seededCatalog = false;

async function ensureSupabaseCatalogSeeded() {
  if (seededCatalog) return;
  if (!usesSupabaseReservationsDb()) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    const { data, error } = await supabase.from("national_apartment_catalog").select("id").limit(1);
    if (error) return;
    if ((data ?? []).length === 0) {
      const payload = nationalApartmentCatalog.map((item) => ({
        name: item.name,
        address: item.address,
        address_type: item.addressType
      }));
      const { error: insertError } = await supabase.from("national_apartment_catalog").insert(payload);
      if (insertError) return;
    }
    seededCatalog = true;
  } catch {
    // ignore and fallback
  }
}

export async function getNationalApartmentSuggestions(query: string, limit = 10): Promise<NationalApartmentItem[]> {
  const keyword = query.trim();
  if (!keyword) return [];

  await ensureSupabaseCatalogSeeded();
  if (usesSupabaseReservationsDb()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("national_apartment_catalog")
          .select("name,address,address_type")
          .ilike("name", `%${keyword}%`)
          .limit(limit);
        if (!error && Array.isArray(data)) {
          return data
            .filter(
              (row): row is { name: string; address: string; address_type: "road" | "jibun" } =>
                typeof row?.name === "string" && typeof row?.address === "string" && (row?.address_type === "road" || row?.address_type === "jibun")
            )
            .map((row) => ({
              name: row.name,
              address: row.address,
              addressType: row.address_type
            }));
        }
      } catch {
        // ignore and fallback
      }
    }
  }

  const lowered = keyword.toLowerCase();
  return nationalApartmentCatalog.filter((item) => item.name.toLowerCase().includes(lowered)).slice(0, limit);
}
