import { promises as fs } from "fs";
import path from "path";
import {
  deleteStorageObjects,
  listStorageObjects,
  readJsonObject,
  SUPABASE_DATA_BUCKET,
  SUPABASE_ENABLED,
  writeJsonObject
} from "@/lib/supabase-server";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import {
  pgBulkRestoreReservationCore,
  pgCreateReservation,
  pgHasReservationTimeConflict,
  pgReadReservations,
  pgUpdateReservation
} from "@/lib/reservations-pg";

export type Reservation = {
  id: string;
  apartmentId?: string | null;
  apartmentName?: string | null;
  apartmentCode?: string | null;
  name: string;
  phone: string;
  address: string;
  serviceType: string;
  preferredDate: string;
  preferredTime: string;
  detail: string;
  imageUrls: string[];
  priority: "normal" | "emergency";
  status: "waiting_payment" | "접수" | "진행중" | "완료" | "취소";
  note: string;
  noteUpdatedAt: string | null;
  baseFee: number;
  extraFee: number;
  totalAmount: number;
  isPaid: boolean;
  paidAt?: string | null;
  createdAt: string;
  /** Supabase DB 모드에서만 채워질 수 있습니다. */
  taskId?: string | null;
  taskStatus?: "assigned" | "in_progress" | "completed" | null;
  /** 기사가 배정을 수락한 시각 — null이면 아직 수락/거절 결정 전(관리자가 방금 배정만 한 상태) */
  taskAcceptedAt?: string | null;
  assignedWorkerId?: string | null;
  assignedWorkerName?: string | null;
  /** 가장 최근 배정 거절 사유(재배정되면 초기화) — 관리자 배정 화면 긴급 재배정 배너용 */
  lastDeclineReason?: string | null;
  lastDeclinedWorkerName?: string | null;
  lastDeclinedAt?: string | null;
  /** 단순 기구교체 현장에서 기사가 상/중/하 작업비 표로 업그레이드한 사유 — 없으면 업그레이드 안 됨 */
  upgradeReason?: string | null;
  upgradedAt?: string | null;
  orderFinalPaymentStatus?: "PENDING" | "REQUESTED" | "PAID" | "FAILED" | "CANCELLED" | null;
  orderTotalFinalFee?: number | null;
  orderWarrantyIssuedAt?: string | null;
  /** orders.payment_status (예약금 등) — Supabase DB 모드에서만 채워질 수 있습니다. */
  orderPaymentStatus?: string | null;
  /** orders.dispatch_status — Supabase DB 모드에서만 채워질 수 있습니다. */
  orderDispatchStatus?: string | null;
  /** orders.prepayment_confirmed — Supabase DB 모드에서만 채워질 수 있습니다. */
  orderPrepaymentConfirmed?: boolean;
  /** 접수 경로: online(웹 예약) | walk_in(현장 즉시접수) | phone(전화접수) */
  source?: "online" | "walk_in" | "phone";
  /** 작업 완료 시각 (walk_in 완료 처리 시 기록) */
  completedAt?: string | null;
};

export type BackupSnapshot = {
  fileName: string;
  kind: "auto" | "manual" | "checkpoint" | "unknown";
  label: string | null;
  updatedAt: string;
  sizeBytes: number;
};

export type BackupPreview = {
  fileName: string;
  count: number;
  latestCreatedAt: string | null;
  earliestCreatedAt: string | null;
};

export type RestoreDiffSummary = {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  beforeCount: number;
  afterCount: number;
};

type BackupMeta = {
  label?: string;
  createdAt: string;
};

const dataPath = path.join(process.cwd(), "data", "reservations.json");
const cloudDataKey = "reservations.json";
// 백업의 진짜 저장소는 Supabase Storage다(backups/ 프리픽스) — 로컬 파일시스템은 Vercel
// 프로덕션에서 지속되지 않아(읽기전용 배포 이미지) 백업이 사실상 하나도 안 남고 있었다
// (운영 공백 점검 9번에서 실제 프로덕션 대상 읽기 전용 확인으로 발견). 로컬 fs 쓰기는
// 로컬 개발 편의용으로만 best-effort로 남기고, 실패해도 무시한다.
const backupsDir = path.join(process.cwd(), "data", "backups");
const rollingBackupPath = path.join(backupsDir, "reservations-latest.json");
const backupMetaPath = path.join(backupsDir, "backup-meta.json");
const storageBackupPrefix = "backups/";
const storageRollingKey = `${storageBackupPrefix}reservations-latest.json`;
const storageMetaKey = `${storageBackupPrefix}backup-meta.json`;
const MAX_BACKUP_FILES = 30;
const snapshotPrefix = "reservations-";
const snapshotSuffix = ".json";

async function bestEffortLocalWrite(filePath: string, content: string) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  } catch {
    // 로컬 개발 편의용 미러일 뿐이라 실패해도 무시 — 진짜 저장소는 Supabase Storage.
  }
}

async function ensureFile() {
  if (SUPABASE_ENABLED) {
    return;
  }
  try {
    await fs.access(dataPath);
  } catch {
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, "[]", "utf-8");
  }
}

function parseReservationsJson(raw: string): Array<Reservation | Omit<Reservation, "status" | "note" | "noteUpdatedAt" | "priority" | "preferredTime">> {
  const cleaned = raw.replaceAll("\u0000", "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    return [];
  }

  try {
    return JSON.parse(cleaned) as Array<
      Reservation | Omit<Reservation, "status" | "note" | "noteUpdatedAt" | "priority" | "preferredTime">
    >;
  } catch {
    return [];
  }
}

async function readBackupMetaMap(): Promise<Record<string, BackupMeta>> {
  if (SUPABASE_ENABLED) {
    const cloud = await readJsonObject<Record<string, BackupMeta>>(SUPABASE_DATA_BUCKET, storageMetaKey);
    return cloud && typeof cloud === "object" ? cloud : {};
  }
  try {
    const raw = await fs.readFile(backupMetaPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, BackupMeta>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeBackupMetaMap(meta: Record<string, BackupMeta>) {
  const raw = JSON.stringify(meta, null, 2);
  if (SUPABASE_ENABLED) {
    await writeJsonObject(SUPABASE_DATA_BUCKET, storageMetaKey, meta);
  }
  await bestEffortLocalWrite(backupMetaPath, raw);
}

async function upsertBackupMeta(fileName: string, meta: BackupMeta) {
  const current = await readBackupMetaMap();
  current[fileName] = { ...(current[fileName] ?? {}), ...meta };
  await writeBackupMetaMap(current);
}

async function pruneBackupMeta(keptFiles: string[]) {
  const current = await readBackupMetaMap();
  const keepSet = new Set(keptFiles);
  const next = Object.fromEntries(Object.entries(current).filter(([fileName]) => keepSet.has(fileName)));
  await writeBackupMetaMap(next);
}

function isSnapshotFile(fileName: string) {
  return fileName.startsWith(snapshotPrefix) && fileName.endsWith(snapshotSuffix) && fileName !== "reservations-latest.json";
}

function parseSnapshotKind(fileName: string): BackupSnapshot["kind"] {
  if (fileName.startsWith(`${snapshotPrefix}auto-`)) {
    return "auto";
  }
  if (fileName.startsWith(`${snapshotPrefix}manual-`)) {
    return "manual";
  }
  if (fileName.startsWith(`${snapshotPrefix}checkpoint-`)) {
    return "checkpoint";
  }
  return "unknown";
}

function normalizeReservation(
  item: Reservation | Omit<Reservation, "status" | "note" | "noteUpdatedAt" | "priority" | "imageUrls" | "preferredTime">
): Reservation {
  return {
    ...item,
    apartmentId: "apartmentId" in item && typeof item.apartmentId === "string" ? item.apartmentId : null,
    apartmentName: "apartmentName" in item && typeof item.apartmentName === "string" ? item.apartmentName : null,
    apartmentCode: "apartmentCode" in item && typeof item.apartmentCode === "string" ? item.apartmentCode : null,
    preferredTime: "preferredTime" in item && typeof item.preferredTime === "string" ? item.preferredTime : "",
    imageUrls: "imageUrls" in item && Array.isArray(item.imageUrls) ? item.imageUrls : [],
    priority: "priority" in item && item.priority ? item.priority : "normal",
    status: "status" in item && item.status ? item.status : "접수",
    note: "note" in item && typeof item.note === "string" ? item.note : "",
    noteUpdatedAt: "noteUpdatedAt" in item && typeof item.noteUpdatedAt === "string" ? item.noteUpdatedAt : null,
    baseFee: "baseFee" in item && typeof item.baseFee === "number" ? item.baseFee : 50000,
    extraFee: "extraFee" in item && typeof item.extraFee === "number" ? item.extraFee : 0,
    totalAmount:
      "totalAmount" in item && typeof item.totalAmount === "number"
        ? item.totalAmount
        : ("baseFee" in item && typeof item.baseFee === "number" ? item.baseFee : 50000) +
          ("extraFee" in item && typeof item.extraFee === "number" ? item.extraFee : 0),
    isPaid: "isPaid" in item && typeof item.isPaid === "boolean" ? item.isPaid : false,
    paidAt: "paidAt" in item && typeof item.paidAt === "string" ? item.paidAt : null,
    taskId: "taskId" in item ? item.taskId ?? null : null,
    taskStatus: "taskStatus" in item ? item.taskStatus ?? null : null,
    assignedWorkerId: "assignedWorkerId" in item ? item.assignedWorkerId ?? null : null,
    assignedWorkerName: "assignedWorkerName" in item ? item.assignedWorkerName ?? null : null,
    orderFinalPaymentStatus: "orderFinalPaymentStatus" in item ? item.orderFinalPaymentStatus ?? null : null,
    orderTotalFinalFee: "orderTotalFinalFee" in item ? item.orderTotalFinalFee ?? null : null,
    orderWarrantyIssuedAt: "orderWarrantyIssuedAt" in item ? item.orderWarrantyIssuedAt ?? null : null
  };
}

function shouldUsePgReservations(): boolean {
  return isSupabaseReservationsDbReady();
}

async function listSnapshotFileNames(): Promise<string[]> {
  if (SUPABASE_ENABLED) {
    const objects = await listStorageObjects(SUPABASE_DATA_BUCKET, storageBackupPrefix);
    return objects.map((o) => o.name).filter((name) => isSnapshotFile(name));
  }
  await fs.mkdir(backupsDir, { recursive: true });
  return (await fs.readdir(backupsDir)).filter((name) => isSnapshotFile(name));
}

async function createBackupSnapshot(type: "auto" | "manual" | "checkpoint" = "auto"): Promise<string> {
  const current = await readReservations();
  const raw = JSON.stringify(current, null, 2);
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
  const backupFileName = `${snapshotPrefix}${type}-${stamp}${snapshotSuffix}`;

  if (SUPABASE_ENABLED) {
    await writeJsonObject(SUPABASE_DATA_BUCKET, `${storageBackupPrefix}${backupFileName}`, current);
  }
  await bestEffortLocalWrite(path.join(backupsDir, backupFileName), raw);
  await upsertBackupMeta(backupFileName, { createdAt: new Date().toISOString() });

  const allBackups = (await listSnapshotFileNames()).sort((a, b) => b.localeCompare(a));
  const oldBackups = allBackups.slice(MAX_BACKUP_FILES);
  if (oldBackups.length > 0) {
    if (SUPABASE_ENABLED) {
      await deleteStorageObjects(
        SUPABASE_DATA_BUCKET,
        oldBackups.map((name) => `${storageBackupPrefix}${name}`),
      );
    }
    await Promise.all(oldBackups.map((name) => fs.unlink(path.join(backupsDir, name)).catch(() => {})));
  }
  await pruneBackupMeta(allBackups.slice(0, MAX_BACKUP_FILES));
  return backupFileName;
}

async function syncRollingBackup(next: Reservation[]) {
  const raw = JSON.stringify(next, null, 2);
  if (SUPABASE_ENABLED) {
    await writeJsonObject(SUPABASE_DATA_BUCKET, storageRollingKey, next);
  }
  await bestEffortLocalWrite(rollingBackupPath, raw);
}

async function writeReservations(next: Reservation[], options?: { snapshotOnWrite?: boolean }) {
  if (options?.snapshotOnWrite) {
    await createBackupSnapshot("auto");
  }
  if (SUPABASE_ENABLED) {
    await writeJsonObject(SUPABASE_DATA_BUCKET, cloudDataKey, next);
  } else {
    await fs.writeFile(dataPath, JSON.stringify(next, null, 2), "utf-8");
  }
  await syncRollingBackup(next);
}

export async function readReservations(): Promise<Reservation[]> {
  if (shouldUsePgReservations()) {
    return pgReadReservations();
  }

  let parsed:
    | Array<Reservation | Omit<Reservation, "status" | "note" | "noteUpdatedAt" | "priority" | "preferredTime">>
    | null = null;

  if (SUPABASE_ENABLED) {
    const cloud = await readJsonObject<
      Array<Reservation | Omit<Reservation, "status" | "note" | "noteUpdatedAt" | "priority" | "preferredTime">>
    >(SUPABASE_DATA_BUCKET, cloudDataKey);
    parsed = Array.isArray(cloud) ? cloud : [];
  } else {
    await ensureFile();
    const raw = await fs.readFile(dataPath, "utf-8");
    parsed = parseReservationsJson(raw);
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item) => normalizeReservation(item));
}

export async function createReservation(
  payload: Omit<
    Reservation,
    "id" | "createdAt" | "status" | "note" | "noteUpdatedAt" | "priority" | "baseFee" | "extraFee" | "totalAmount" | "isPaid" | "paidAt"
  > & {
    priority?: Reservation["priority"];
    imageUrls?: string[];
    baseFee?: number;
  }
): Promise<Reservation> {
  if (shouldUsePgReservations()) {
    return pgCreateReservation(payload);
  }

  const current = await readReservations();
  const nextItem: Reservation = {
    ...payload,
    apartmentId: "apartmentId" in payload && typeof payload.apartmentId === "string" ? payload.apartmentId : null,
    apartmentName: "apartmentName" in payload && typeof payload.apartmentName === "string" ? payload.apartmentName : null,
    apartmentCode: "apartmentCode" in payload && typeof payload.apartmentCode === "string" ? payload.apartmentCode : null,
    imageUrls: payload.imageUrls ?? [],
    priority: payload.priority ?? "normal",
    status: "waiting_payment",
    note: "",
    noteUpdatedAt: null,
    baseFee: typeof payload.baseFee === "number" && Number.isFinite(payload.baseFee) ? Math.max(50000, Math.round(payload.baseFee)) : 50000,
    extraFee: 0,
    totalAmount: typeof payload.baseFee === "number" && Number.isFinite(payload.baseFee) ? Math.max(50000, Math.round(payload.baseFee)) : 50000,
    isPaid: false,
    paidAt: null,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };

  current.unshift(nextItem);
  await writeReservations(current, { snapshotOnWrite: true });
  return nextItem;
}

export async function hasReservationTimeConflict(preferredDate: string, preferredTime: string, excludeId?: string) {
  if (shouldUsePgReservations()) {
    return pgHasReservationTimeConflict(preferredDate, preferredTime, excludeId);
  }

  const current = await readReservations();
  return current.some(
    (item) =>
      item.id !== excludeId &&
      item.status !== "완료" &&
      item.priority !== "emergency" &&
      item.preferredDate === preferredDate &&
      item.preferredTime === preferredTime
  );
}

export async function updateReservation(
  id: string,
  update: Partial<Pick<Reservation, "status" | "note" | "noteUpdatedAt" | "preferredDate" | "preferredTime">>
): Promise<Reservation | null> {
  if (shouldUsePgReservations()) {
    return pgUpdateReservation(id, update);
  }

  const current = await readReservations();
  const index = current.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }

  current[index] = { ...current[index], ...update };
  await writeReservations(current);
  return current[index];
}

async function listSnapshotsWithInfo(): Promise<{ name: string; updatedAt: string; sizeBytes: number }[]> {
  if (SUPABASE_ENABLED) {
    const objects = await listStorageObjects(SUPABASE_DATA_BUCKET, storageBackupPrefix);
    return objects
      .filter((o) => isSnapshotFile(o.name))
      .map((o) => ({ name: o.name, updatedAt: o.updatedAt, sizeBytes: o.sizeBytes }));
  }
  await fs.mkdir(backupsDir, { recursive: true });
  const files = (await fs.readdir(backupsDir)).filter((name) => isSnapshotFile(name));
  return Promise.all(
    files.map(async (name) => {
      const stats = await fs.stat(path.join(backupsDir, name));
      return { name, updatedAt: stats.mtime.toISOString(), sizeBytes: stats.size };
    }),
  );
}

export async function readBackupStatus(): Promise<{
  snapshotCount: number;
  latestSnapshotAt: string | null;
  rollingBackupUpdatedAt: string | null;
}> {
  await ensureFile();

  const infos = (await listSnapshotsWithInfo()).sort((a, b) => b.name.localeCompare(a.name));
  const latestSnapshotAt = infos[0]?.updatedAt ?? null;

  let rollingBackupUpdatedAt: string | null = null;
  if (SUPABASE_ENABLED) {
    const objects = await listStorageObjects(SUPABASE_DATA_BUCKET, storageBackupPrefix);
    rollingBackupUpdatedAt = objects.find((o) => o.name === "reservations-latest.json")?.updatedAt ?? null;
  } else {
    try {
      const stats = await fs.stat(rollingBackupPath);
      rollingBackupUpdatedAt = stats.mtime.toISOString();
    } catch {
      rollingBackupUpdatedAt = null;
    }
  }

  return {
    snapshotCount: infos.length,
    latestSnapshotAt,
    rollingBackupUpdatedAt
  };
}

export async function listBackupSnapshots(limit = 20): Promise<BackupSnapshot[]> {
  const metaMap = await readBackupMetaMap();
  const infos = (await listSnapshotsWithInfo())
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, limit);

  return infos.map((info) => ({
    fileName: info.name,
    kind: parseSnapshotKind(info.name),
    label: metaMap[info.name]?.label ?? null,
    updatedAt: info.updatedAt,
    sizeBytes: info.sizeBytes
  }));
}

/** fs.stat으로 로컬 미러 파일 크기를 재는 대신 생성 시각을 그대로 쓴다 — 프로덕션에서는
 *  로컬 쓰기가 best-effort라 파일이 아예 없을 수 있고, 그러면 fs.stat이 죽는다. */
async function backupResultFor(fileName: string): Promise<BackupSnapshot> {
  return {
    fileName,
    kind: parseSnapshotKind(fileName),
    label: null,
    updatedAt: new Date().toISOString(),
    sizeBytes: 0
  };
}

export async function createManualBackup(): Promise<BackupSnapshot> {
  const fileName = await createBackupSnapshot("manual");
  return backupResultFor(fileName);
}

/** 크론 전용 — 예약 write 시점 자동백업이 PG 모드에서는 애초에 안 불려서(운영 공백 점검
 *  9번), 시간 기반으로 별도 트리거한다. */
export async function createAutoBackup(): Promise<BackupSnapshot> {
  const fileName = await createBackupSnapshot("auto");
  return backupResultFor(fileName);
}

function summarizeDiff(before: Reservation[], after: Reservation[]): RestoreDiffSummary {
  const beforeMap = new Map(before.map((item) => [item.id, JSON.stringify(item)]));
  const afterMap = new Map(after.map((item) => [item.id, JSON.stringify(item)]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;

  for (const [id, afterRow] of afterMap.entries()) {
    const beforeRow = beforeMap.get(id);
    if (!beforeRow) {
      added += 1;
    } else if (beforeRow !== afterRow) {
      changed += 1;
    } else {
      unchanged += 1;
    }
  }
  for (const id of beforeMap.keys()) {
    if (!afterMap.has(id)) {
      removed += 1;
    }
  }

  return {
    added,
    removed,
    changed,
    unchanged,
    beforeCount: before.length,
    afterCount: after.length
  };
}

async function readSnapshotRaw(fileName: string): Promise<string> {
  if (SUPABASE_ENABLED) {
    const cloud = await readJsonObject<unknown>(SUPABASE_DATA_BUCKET, `${storageBackupPrefix}${fileName}`);
    if (cloud !== null) return JSON.stringify(cloud);
  }
  const backupPath = path.join(backupsDir, fileName);
  return fs.readFile(backupPath, "utf-8");
}

/**
 * PG 모드에서는 reservations 테이블 핵심 필드만 복원한다(task 배정/주문·결제 상태는 안 됨 —
 * pgBulkRestoreReservationCore 주석 참고). PG 모드가 아니면 기존처럼 전체 스토어를 통째로
 * 되돌린다.
 */
export async function restoreBackupSnapshot(
  fileName: string,
  checkpointLabel?: string
): Promise<{
  reservations: Reservation[];
  diff: RestoreDiffSummary;
  checkpointFileName: string;
  pgRestoreNote: string | null;
}> {
  if (!isSnapshotFile(fileName)) {
    throw new Error("유효하지 않은 백업 파일명입니다.");
  }

  const raw = await readSnapshotRaw(fileName);
  const parsed = JSON.parse(raw) as Array<
    Reservation | Omit<Reservation, "status" | "note" | "noteUpdatedAt" | "priority" | "preferredTime">
  >;
  if (!Array.isArray(parsed)) {
    throw new Error("백업 데이터 형식이 올바르지 않습니다.");
  }

  const before = await readReservations();
  const next = parsed.map((item) => normalizeReservation(item));
  const checkpointFileName = await createBackupSnapshot("checkpoint");
  if (checkpointLabel?.trim()) {
    await upsertBackupMeta(checkpointFileName, {
      label: checkpointLabel.trim(),
      createdAt: new Date().toISOString()
    });
  }

  let pgRestoreNote: string | null = null;
  if (shouldUsePgReservations()) {
    const result = await pgBulkRestoreReservationCore(next);
    pgRestoreNote =
      `핵심 필드 ${result.updated}건 복원, 삭제된 예약이라 건너뜀 ${result.skippedNotFound}건` +
      (result.errors.length > 0 ? `, 실패 ${result.errors.length}건` : "") +
      " — 기사 배정·주문/결제 상태는 이 복원에 포함되지 않습니다(별도 테이블).";
  } else {
    await writeReservations(next);
  }

  const after = await readReservations();
  return {
    reservations: after,
    diff: summarizeDiff(before, after),
    checkpointFileName,
    pgRestoreNote
  };
}

export async function readBackupFile(fileName: string): Promise<string> {
  if (!isSnapshotFile(fileName)) {
    throw new Error("유효하지 않은 백업 파일명입니다.");
  }
  return readSnapshotRaw(fileName);
}

export async function previewBackupSnapshot(fileName: string): Promise<BackupPreview> {
  if (!isSnapshotFile(fileName)) {
    throw new Error("유효하지 않은 백업 파일명입니다.");
  }

  const raw = await readSnapshotRaw(fileName);
  const parsed = JSON.parse(raw) as Array<
    Reservation | Omit<Reservation, "status" | "note" | "noteUpdatedAt" | "priority" | "preferredTime">
  >;
  if (!Array.isArray(parsed)) {
    throw new Error("백업 데이터 형식이 올바르지 않습니다.");
  }

  const normalized = parsed.map((item) => normalizeReservation(item));
  const sorted = [...normalized].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    fileName,
    count: normalized.length,
    earliestCreatedAt: sorted[0]?.createdAt ?? null,
    latestCreatedAt: sorted[sorted.length - 1]?.createdAt ?? null
  };
}
