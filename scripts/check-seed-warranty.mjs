import fs from "fs";
import path from "path";

function loadEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

const envPath = path.join(process.cwd(), ".env.local");
const env = loadEnvFile(envPath);
const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://www.dkansim.com";
const targetWarrantyNumber = "WST-2024-APT001-3A8F2";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json"
};

async function main() {
  const existingRes = await fetch(
    `${supabaseUrl}/rest/v1/warranties?select=id,warranty_number,reservation_id,apt_id,status&warranty_number=eq.${encodeURIComponent(targetWarrantyNumber)}`,
    { headers }
  );
  const existingRows = await existingRes.json();
  if (Array.isArray(existingRows) && existingRows.length > 0) {
    console.log("FOUND", existingRows[0]);
    return;
  }

  console.log("NOT_FOUND");
  const reservationRes = await fetch(
    `${supabaseUrl}/rest/v1/reservations?select=id,apartment_id,service_type,detail,total_amount,worker_id,created_at&order=created_at.desc&limit=30`,
    { headers }
  );
  const reservationRows = await reservationRes.json();

  const warrantyLinksRes = await fetch(`${supabaseUrl}/rest/v1/warranties?select=reservation_id&limit=500`, { headers });
  const warrantyLinks = await warrantyLinksRes.json();
  const linkedReservationIds = new Set(
    Array.isArray(warrantyLinks) ? warrantyLinks.map((row) => row.reservation_id).filter(Boolean) : []
  );

  let source = Array.isArray(reservationRows)
    ? reservationRows.find((row) => row?.id && !linkedReservationIds.has(row.id))
    : null;

  if (!source) {
    const apartmentRes = await fetch(`${supabaseUrl}/rest/v1/apartments?select=id,name,apt_code&order=created_at.asc&limit=1`, { headers });
    const apartmentRows = await apartmentRes.json();
    if (!Array.isArray(apartmentRows) || apartmentRows.length === 0) {
      console.log("NO_APARTMENT_FOR_SEED");
      return;
    }
    const apartment = apartmentRows[0];
    const nowIso = new Date().toISOString();
    const newReservationPayload = {
      apartment_id: apartment.id,
      name: "특허 샘플 입주민",
      phone: "01000000000",
      address: "101동 1001호",
      service_type: "LEAKAGE",
      preferred_date: nowIso.slice(0, 10),
      preferred_time: "14:00",
      detail: "샘플 보증서 생성용 예약",
      image_urls: [],
      priority: "normal",
      status: "완료",
      payment_status: "SETTLED",
      note: "sample",
      note_updated_at: nowIso,
      base_fee: 50000,
      extra_fee: 400000,
      total_amount: 450000,
      is_paid: true,
      paid_at: nowIso,
      prepayment_confirmed: true,
      prepayment_confirmed_at: nowIso,
      prepayment_tx_id: `SAMPLE-${Date.now()}`
    };
    const createReservationRes = await fetch(`${supabaseUrl}/rest/v1/reservations`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(newReservationPayload)
    });
    if (!createReservationRes.ok) {
      console.error("RESERVATION_INSERT_FAILED", createReservationRes.status, await createReservationRes.text());
      process.exit(1);
    }
    const createdReservationRows = await createReservationRes.json();
    source = createdReservationRows?.[0] ?? null;
    if (!source) {
      console.log("RESERVATION_CREATE_EMPTY");
      return;
    }
    console.log("RESERVATION_CREATED", source.id);
  }

  if (!source.apartment_id) {
    console.log("SOURCE_RESERVATION_HAS_NO_APARTMENT");
    return;
  }
  const now = new Date();
  const startDate = now.toISOString().slice(0, 10);
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);
  const endDate = end.toISOString().slice(0, 10);

  const payload = {
    warranty_number: targetWarrantyNumber,
    reservation_id: source.id,
    apt_id: source.apartment_id,
    technician_id: source.worker_id || null,
    service_type: source.service_type || "LEAKAGE",
    service_summary: source.detail || "특허 샘플 보증서 시드 데이터",
    warranty_months: 12,
    warranty_start: startDate,
    warranty_end: endDate,
    final_amount: source.total_amount || 50000,
    verify_url: `${appUrl}/verify/${targetWarrantyNumber}`,
    status: "ISSUED"
  };

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/warranties`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  if (!insertRes.ok) {
    console.error("INSERT_FAILED", insertRes.status, await insertRes.text());
    process.exit(1);
  }
  const insertedRows = await insertRes.json();
  const inserted = insertedRows?.[0];
  console.log("INSERTED", inserted);

  if (inserted?.id) {
    const updateRes = await fetch(`${supabaseUrl}/rest/v1/reservations?id=eq.${source.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        warranty_id: inserted.id,
        warranty_status: "ISSUED"
      })
    });
    if (!updateRes.ok) {
      console.error("RESERVATION_PATCH_FAILED", updateRes.status, await updateRes.text());
      process.exit(1);
    }
    console.log("RESERVATION_PATCHED", source.id);
  }
}

await main();
