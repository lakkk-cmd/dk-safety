import { promises as fs } from "fs";
import path from "path";

export type ActivityLog = {
  id: string;
  action: "reservation_created" | "status_updated" | "note_updated" | "backup_restored";
  reservationId: string;
  message: string;
  createdAt: string;
};

const logPath = path.join(process.cwd(), "data", "activity-log.json");

async function ensureLogFile() {
  try {
    await fs.access(logPath);
  } catch {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, "[]", "utf-8");
  }
}

export async function readActivityLogs(limit = 20): Promise<ActivityLog[]> {
  await ensureLogFile();
  const raw = await fs.readFile(logPath, "utf-8");
  const parsed = JSON.parse(raw) as ActivityLog[];
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.slice(0, limit);
}

export async function appendActivityLog(payload: Omit<ActivityLog, "id" | "createdAt">) {
  await ensureLogFile();
  const raw = await fs.readFile(logPath, "utf-8");
  const parsed = JSON.parse(raw) as ActivityLog[];
  const current = Array.isArray(parsed) ? parsed : [];

  const next: ActivityLog = {
    ...payload,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  current.unshift(next);
  await fs.writeFile(logPath, JSON.stringify(current.slice(0, 200), null, 2), "utf-8");
  return next;
}
