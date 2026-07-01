import { promises as fs } from "fs";
import path from "path";
import {
  readJsonObject,
  SUPABASE_DATA_BUCKET,
  SUPABASE_ENABLED,
  writeJsonObject
} from "@/lib/supabase-server";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import {
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
  status: "waiting_payment" | "접수" | "진행중" | "완료";
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
  assignedWorkerId?: string | null;
  assignedWorkerName?: string | null;
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
const backupsDir = path.join(process.cwd(), "data", "backups");
const rollingBackupPath = path.join(backupsDir, "reservations-latest.json");
const backupMetaPath = path.join(backupsDir, "backup-meta.json");
const MAX_BACKUP_FILES = 30;
const snapshotPrefix = "reservations-";
const snapshotSuffix = ".json";

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
  await fs.mkdir(backupsDir, { recursive: true });
  try {
    const raw = await fs.readFile(backupMetaPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, BackupMeta>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeBackupMetaMap(meta: Record<string, BackupMeta>) {
  await fs.mkdir(backupsDir, { recursive: true });
  await fs.writeFile(backupMetaPath, JSON.stringify(meta, null, 2), "utf-8");
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

async function createBackupSnapshot(type: "auto" | "manual" | "checkpoint" = "auto"): Promise<string> {
  await fs.mkdir(backupsDir, { recursive: true });
  const current = await readReservations();
  const raw = JSON.stringify(current, null, 2);
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
  const backupFileName = `${snapshotPrefix}${type}-${stamp}${snapshotSuffix}`;
  const backupPath = path.join(backupsDir, backupFileName);
  await fs.writeFile(backupPath, raw, "utf-8");
  await upsertBackupMeta(backupFileName, { createdAt: new Date().toISOString() });

  const allBackups = (await fs.readdir(backupsDir))
    .filter((name) => isSnapshotFile(name))
    .sort((a, b) => b.localeCompare(a));
  const oldBackups = allBackups.slice(MAX_BACKUP_FILES);
  await Promise.all(oldBackups.map((name) => fs.unlink(path.join(backupsDir, name))));
  await pruneBackupMeta(allBackups.slice(0, MAX_BACKUP_FILES));
  return backupFileName;
}

async function syncRollingBackup(next: Reservation[]) {
  await fs.mkdir(backupsDir, { recursive: true });
  await fs.writeFile(rollingBackupPath, JSON.stringify(next, null, 2), "utf-8");
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

export async function hasReservationTimeConflict(preferredDate: string, preferredTime: string) {
  if (shouldUsePgReservations()) {
    return pgHasReservationTimeConflict(preferredDate, preferredTime);
  }

  const current = await readReservations();
  return current.some(
    (item) =>
      item.status !== "완료" &&
      item.priority !== "emergency" &&
      item.preferredDate === preferredDate &&
      item.preferredTime === preferredTime
  );
}

export async function updateReservation(
  id: string,
  update: Partial<Pick<Reservation, "status" | "note" | "noteUpdatedAt">>
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

export async function readBackupStatus(): Promise<{
  snapshotCount: number;
  latestSnapshotAt: string | null;
  rollingBackupUpdatedAt: string | null;
}> {
  await ensureFile();
  await fs.mkdir(backupsDir, { recursive: true });

  const files = (await fs.readdir(backupsDir))
    .filter((name) => isSnapshotFile(name))
    .sort((a, b) => b.localeCompare(a));

  let latestSnapshotAt: string | null = null;
  if (files[0]) {
    const latestStats = await fs.stat(path.join(backupsDir, files[0]));
    latestSnapshotAt = latestStats.mtime.toISOString();
  }

  let rollingBackupUpdatedAt: string | null = null;
  try {
    const stats = await fs.stat(rollingBackupPath);
    rollingBackupUpdatedAt = stats.mtime.toISOString();
  } catch {
    rollingBackupUpdatedAt = null;
  }

  return {
    snapshotCount: files.length,
    latestSnapshotAt,
    rollingBackupUpdatedAt
  };
}

export async function listBackupSnapshots(limit = 20): Promise<BackupSnapshot[]> {
  await fs.mkdir(backupsDir, { recursive: true });
  const metaMap = await readBackupMetaMap();
  const files = (await fs.readdir(backupsDir))
    .filter((name) => isSnapshotFile(name))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);

  return Promise.all(
    files.map(async (fileName) => {
      const filePath = path.join(backupsDir, fileName);
      const stats = await fs.stat(filePath);
      return {
        fileName,
        kind: parseSnapshotKind(fileName),
        label: metaMap[fileName]?.label ?? null,
        updatedAt: stats.mtime.toISOString(),
        sizeBytes: stats.size
      };
    })
  );
}

export async function createManualBackup() {
  const fileName = await createBackupSnapshot("manual");
  const stats = await fs.stat(path.join(backupsDir, fileName));
  return {
    fileName,
    kind: parseSnapshotKind(fileName),
    label: null,
    updatedAt: stats.mtime.toISOString(),
    sizeBytes: stats.size
  };
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

export async function restoreBackupSnapshot(
  fileName: string,
  checkpointLabel?: string
): Promise<{ reservations: Reservation[]; diff: RestoreDiffSummary; checkpointFileName: string }> {
  if (!isSnapshotFile(fileName)) {
    throw new Error("유효하지 않은 백업 파일명입니다.");
  }

  const backupPath = path.join(backupsDir, fileName);
  const raw = await fs.readFile(backupPath, "utf-8");
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
  await writeReservations(next);
  return {
    reservations: next,
    diff: summarizeDiff(before, next),
    checkpointFileName
  };
}

export async function readBackupFile(fileName: string): Promise<string> {
  if (!isSnapshotFile(fileName)) {
    throw new Error("유효하지 않은 백업 파일명입니다.");
  }
  const filePath = path.join(backupsDir, fileName);
  return fs.readFile(filePath, "utf-8");
}

export async function previewBackupSnapshot(fileName: string): Promise<BackupPreview> {
  if (!isSnapshotFile(fileName)) {
    throw new Error("유효하지 않은 백업 파일명입니다.");
  }

  const backupPath = path.join(backupsDir, fileName);
  const raw = await fs.readFile(backupPath, "utf-8");
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
