/**
 * crm_customers 일회성 백필(2026-09-10) — 기존 reservations/consultation_logs를 전화번호로
 * 합치던 listCustomerSummary()의 로직을 그대로 재현해 crm_customers 행을 만들고, 각 원본 행에
 * customer_id를 되채운다. 이후로는 이 스크립트를 다시 돌릴 필요 없음(신규 생성 경로는
 * findOrCreateCrmCustomer()가 실시간으로 처리) — 재실행해도 phone unique 제약 덕분에 중복
 * 생성되지는 않지만(upsert onConflict:phone), 이미 연결된 customer_id를 다시 덮어쓰지는 않는다.
 *
 * 실행: node --env-file=.env.local scripts/backfill-crm-customers.mjs
 */
import { createClient } from "@supabase/supabase-js";

function normalizePhone(phone) {
  return phone.replaceAll(/[^0-9]/g, "").replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3");
}

const CONSULTATION_SOURCE_LABEL = {
  unit_inspection: "세대전기점검",
  manual_lead: "관리자 직접등록",
  excel_import: "엑셀 일괄등록",
  consultation: "상담 기록"
};

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: reservations, error: rErr } = await supabase
    .from("reservations")
    .select("id, name, phone, address, created_at")
    .order("created_at", { ascending: true });
  if (rErr) throw new Error(rErr.message);

  const { data: consultLogs, error: cErr } = await supabase
    .from("consultation_logs")
    .select("id, customer_name, customer_phone, address, source, created_at")
    .order("created_at", { ascending: true });
  if (cErr) throw new Error(cErr.message);

  // phone -> { name, address, registeredVia, registeredAt, reservationIds: [], consultationIds: [] }
  const map = new Map();

  for (const r of reservations ?? []) {
    if (!r.phone) continue;
    const phone = normalizePhone(r.phone);
    if (!map.has(phone)) {
      map.set(phone, {
        name: r.name,
        address: r.address ?? null,
        registeredVia: "예약",
        registeredAt: r.created_at,
        reservationIds: [],
        consultationIds: []
      });
    }
    map.get(phone).reservationIds.push(r.id);
  }

  for (const c of consultLogs ?? []) {
    if (!c.customer_phone) continue;
    const phone = normalizePhone(c.customer_phone);
    if (!map.has(phone)) {
      map.set(phone, {
        name: c.customer_name,
        address: c.address ?? null,
        registeredVia: c.source ? CONSULTATION_SOURCE_LABEL[c.source] ?? null : null,
        registeredAt: c.created_at,
        reservationIds: [],
        consultationIds: []
      });
    }
    map.get(phone).consultationIds.push(c.id);
  }

  console.log(`고유 전화번호 ${map.size}건 발견 — crm_customers 백필 시작`);

  let created = 0;
  let linkedReservations = 0;
  let linkedConsultations = 0;

  for (const [phone, entry] of map) {
    const { data: existing } = await supabase.from("crm_customers").select("id").eq("phone", phone).maybeSingle();
    let customerId = existing?.id;

    if (!customerId) {
      const { data: inserted, error: insErr } = await supabase
        .from("crm_customers")
        .insert({
          phone,
          name: entry.name,
          address: entry.address,
          registered_via: entry.registeredVia,
          registered_at: entry.registeredAt
        })
        .select("id")
        .single();
      if (insErr) {
        console.error(`  ${phone} 생성 실패: ${insErr.message}`);
        continue;
      }
      customerId = inserted.id;
      created += 1;
    }

    if (entry.reservationIds.length > 0) {
      const { error } = await supabase.from("reservations").update({ customer_id: customerId }).in("id", entry.reservationIds).is("customer_id", null);
      if (error) console.error(`  ${phone} 예약 연결 실패: ${error.message}`);
      else linkedReservations += entry.reservationIds.length;
    }
    if (entry.consultationIds.length > 0) {
      const { error } = await supabase.from("consultation_logs").update({ customer_id: customerId }).in("id", entry.consultationIds).is("customer_id", null);
      if (error) console.error(`  ${phone} 상담기록 연결 실패: ${error.message}`);
      else linkedConsultations += entry.consultationIds.length;
    }
  }

  // follow_up_reminders는 consultation_id -> consultation_logs.customer_id를 거쳐 연결한다.
  const { data: reminders } = await supabase
    .from("follow_up_reminders")
    .select("id, consultation_id, customer_phone")
    .is("customer_id", null);
  let linkedReminders = 0;
  for (const rem of reminders ?? []) {
    const phone = rem.customer_phone ? normalizePhone(rem.customer_phone) : null;
    if (!phone) continue;
    const { data: cust } = await supabase.from("crm_customers").select("id").eq("phone", phone).maybeSingle();
    if (!cust) continue;
    const { error } = await supabase.from("follow_up_reminders").update({ customer_id: cust.id }).eq("id", rem.id);
    if (!error) linkedReminders += 1;
  }

  console.log(`완료: crm_customers ${created}건 신규 생성, 예약 ${linkedReservations}건/상담기록 ${linkedConsultations}건/재상담알림 ${linkedReminders}건 연결`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
