/**
 * End-to-end smoke test (local dev server)
 * Flow: reservation create -> admin login -> worker create -> assign -> worker start/upload/complete
 */
const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const adminPassword = process.env.ADMIN_PASSWORD ?? "";

if (!adminPassword) {
  throw new Error("ADMIN_PASSWORD is required.");
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

function extractSetCookieHeaders(response) {
  const anyHeaders = response.headers;
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  const joined = response.headers.get("set-cookie");
  return joined ? [joined] : [];
}

function updateCookieJarFromResponse(cookieJar, response) {
  const setCookies = extractSetCookieHeaders(response);
  for (const header of setCookies) {
    const first = header.split(";")[0];
    const idx = first.indexOf("=");
    if (idx <= 0) continue;
    const name = first.slice(0, idx).trim();
    const value = first.slice(idx + 1).trim();
    cookieJar.set(name, value);
  }
}

function cookieHeader(cookieJar) {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchJson(url, options = {}, cookieJar) {
  const headers = new Headers(options.headers ?? {});
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  if (cookieJar && cookieJar.size > 0) {
    headers.set("Cookie", cookieHeader(cookieJar));
  }
  const response = await fetch(url, { ...options, headers });
  if (cookieJar) {
    updateCookieJarFromResponse(cookieJar, response);
  }
  const text = await response.text();
  let json = null;
  if (text.trim()) {
    json = JSON.parse(text);
  }
  return { response, json };
}

async function main() {
  const now = Date.now();
  const reservationPhone = `010-${String(now).slice(-8, -4)}-${String(now).slice(-4)}`;
  const workerPhone = `010-${String(now + 777).slice(-8, -4)}-${String(now + 777).slice(-4)}`;
  const workerPin = "9876";
  const adminCookies = new Map();
  const workerCookies = new Map();
  const timeSlots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];
  let createReservation = null;
  for (let i = 0; i < 14; i += 1) {
    const preferredDate = new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const preferredTime = timeSlots[i % timeSlots.length];
    createReservation = await fetchJson(`${baseUrl}/api/reservations`, {
      method: "POST",
      body: JSON.stringify({
        name: `테스트고객-${now}`,
        phone: reservationPhone,
        address: "대구광역시 테스트구 1-1",
        serviceType: "누전/합선 점검",
        preferredDate,
        preferredTime,
        detail: "자동 스모크 테스트 예약"
      })
    });
    if (createReservation.response.ok) break;
    if (createReservation.response.status !== 409) break;
  }
  assertOk(Boolean(createReservation), "Reservation create result missing.");
  assertOk(
    createReservation.response.ok,
    `Reservation create failed: ${createReservation.response.status} ${createReservation.json?.message ?? ""}`.trim()
  );
  const reservationId = createReservation.json?.reservation?.id;
  assertOk(Boolean(reservationId), "Reservation ID missing.");

  const adminLogin = await fetchJson(`${baseUrl}/api/admin/login`, {
    method: "POST",
    body: JSON.stringify({ password: adminPassword })
  }, adminCookies);
  assertOk(adminLogin.response.ok, `Admin login failed: ${adminLogin.response.status}`);

  const createWorker = await fetchJson(`${baseUrl}/api/admin/workers`, {
    method: "POST",
    body: JSON.stringify({
      name: `기사-${now}`,
      phone: workerPhone,
      pin: workerPin
    })
  }, adminCookies);
  assertOk(createWorker.response.ok, `Create worker failed: ${createWorker.response.status}`);
  const workerId = createWorker.json?.worker?.id;
  assertOk(Boolean(workerId), "Worker ID missing.");

  const markPaid = await fetchJson(`${baseUrl}/api/admin/reservations/payment`, {
    method: "PATCH",
    body: JSON.stringify({ reservationId, isPaid: true })
  }, adminCookies);
  assertOk(markPaid.response.ok, `Mark payment failed: ${markPaid.response.status}`);

  const assign = await fetchJson(`${baseUrl}/api/admin/tasks/assign`, {
    method: "POST",
    body: JSON.stringify({ reservationId, workerId })
  }, adminCookies);
  assertOk(assign.response.ok, `Assign task failed: ${assign.response.status}`);

  const workerLogin = await fetchJson(`${baseUrl}/api/worker/login`, {
    method: "POST",
    body: JSON.stringify({ phone: workerPhone, pin: workerPin })
  }, workerCookies);
  assertOk(workerLogin.response.ok, `Worker login failed: ${workerLogin.response.status}`);

  const workerTasks = await fetchJson(`${baseUrl}/api/worker/tasks`, { method: "GET", headers: {} }, workerCookies);
  assertOk(workerTasks.response.ok, `Worker tasks failed: ${workerTasks.response.status}`);
  const hit = workerTasks.json?.items?.find((item) => item?.reservation?.id === reservationId);
  assertOk(Boolean(hit), "Assigned task not visible to worker.");
  const taskId = hit.task.id;

  const startTask = await fetchJson(`${baseUrl}/api/worker/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "start" })
  }, workerCookies);
  assertOk(startTask.response.ok, `Start task failed: ${startTask.response.status}`);

  const formData = new FormData();
  const fakePng = new Blob(["PNG"], { type: "image/png" });
  formData.append("photos", fakePng, "site.png");
  const uploadHeaders = new Headers();
  if (workerCookies.size > 0) {
    uploadHeaders.set("Cookie", cookieHeader(workerCookies));
  }
  const photoRes = await fetch(`${baseUrl}/api/worker/tasks/${taskId}/photos`, {
    method: "POST",
    body: formData,
    headers: uploadHeaders
  });
  updateCookieJarFromResponse(workerCookies, photoRes);
  assertOk(photoRes.ok, `Upload photo failed: ${photoRes.status}`);

  const signaturePng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgNAvFp8AAAAASUVORK5CYII=";
  const completeTask = await fetchJson(`${baseUrl}/api/worker/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "complete", signaturePng, extraFee: 12000 })
  }, workerCookies);
  assertOk(completeTask.response.ok, `Complete task failed: ${completeTask.response.status}`);

  const adminData = await fetchJson(`${baseUrl}/api/admin/reservations-data`, { method: "GET", headers: {} }, adminCookies);
  assertOk(adminData.response.ok, `Admin reservations-data failed: ${adminData.response.status}`);
  const updated = adminData.json?.reservations?.find((item) => item?.id === reservationId);
  assertOk(updated?.status === "완료", "Reservation status was not updated to 완료.");
  assertOk(updated?.isPaid === true, "Reservation payment status was not updated to paid.");
  assertOk(updated?.extraFee === 12000, "Reservation extra fee was not updated.");
  assertOk(updated?.totalAmount === updated?.baseFee + updated?.extraFee, "Reservation total amount mismatch.");

  console.log("SMOKE TEST PASSED");
  console.log(JSON.stringify({ reservationId, workerId, taskId }, null, 2));
}

main().catch((error) => {
  console.error("SMOKE TEST FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});

