import { requireAgentSupabase } from "@/lib/agent-db";

export const MEMORY_KEY_SCHEDULE = "meeting_schedule";
export const MEMORY_KEY_PENDING_TOPICS = "pending_meeting_topics";

export const DEFAULT_MEETING_TOPICS = ["마케팅 전략", "앱 다음 스펙", "수익 구조 점검"];

export type MeetingScheduleConfig = {
  /** KST 기준 보고 실행일 (YYYY-MM-DD). 첫 보고 = 내일 */
  firstReportDate: string;
  firstReportCompleted: boolean;
  /** 주간 보고 요일 (0=일요일) */
  weeklyDay: 0;
};

export type KstDateTime = {
  dateKey: string;
  dayOfWeek: number;
  hour: number;
  label: string;
};

export function getKstDateTime(now = new Date()): KstDateTime {
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const [year, month, day] = dateKey.split("-");

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    dateKey,
    dayOfWeek: dayMap[weekday] ?? 0,
    hour,
    label: `${year}. ${month}. ${day}.`,
  };
}

export function getTomorrowKstDateKey(now = new Date()): string {
  return getKstDateTime(new Date(now.getTime() + 24 * 60 * 60 * 1000)).dateKey;
}

export function defaultMeetingSchedule(now = new Date()): MeetingScheduleConfig {
  return {
    firstReportDate: getTomorrowKstDateKey(now),
    firstReportCompleted: false,
    weeklyDay: 0,
  };
}

export function parseMeetingSchedule(raw: string | null | undefined): MeetingScheduleConfig | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Partial<MeetingScheduleConfig>;
    if (!o.firstReportDate) return null;
    return {
      firstReportDate: String(o.firstReportDate),
      firstReportCompleted: Boolean(o.firstReportCompleted),
      weeklyDay: 0,
    };
  } catch {
    return null;
  }
}

export async function loadMeetingSchedule(): Promise<MeetingScheduleConfig> {
  const supabase = requireAgentSupabase();
  const { data } = await supabase
    .from("agent_memory")
    .select("content")
    .eq("key", MEMORY_KEY_SCHEDULE)
    .maybeSingle();

  const parsed = parseMeetingSchedule(data?.content);
  if (parsed) return parsed;

  const initial = defaultMeetingSchedule();
  await saveMeetingSchedule(initial);
  return initial;
}

export async function saveMeetingSchedule(config: MeetingScheduleConfig): Promise<void> {
  const supabase = requireAgentSupabase();
  await supabase.from("agent_memory").upsert({
    key: MEMORY_KEY_SCHEDULE,
    content: JSON.stringify(config),
    updated_at: new Date().toISOString(),
  });
}

export async function markFirstReportCompleted(): Promise<void> {
  const schedule = await loadMeetingSchedule();
  await saveMeetingSchedule({ ...schedule, firstReportCompleted: true });
}

export function parsePendingTopics(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).map((t) => t.trim()).filter((t) => t.length >= 2).slice(0, 8);
  } catch {
    return raw
      .split("\n")
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .slice(0, 8);
  }
}

export async function loadPendingTopics(): Promise<string[]> {
  const supabase = requireAgentSupabase();
  const { data } = await supabase
    .from("agent_memory")
    .select("content")
    .eq("key", MEMORY_KEY_PENDING_TOPICS)
    .maybeSingle();
  return parsePendingTopics(data?.content ?? "");
}

export async function savePendingTopics(topics: string[]): Promise<void> {
  const supabase = requireAgentSupabase();
  const normalized = topics.map((t) => t.trim()).filter((t) => t.length >= 2).slice(0, 8);
  if (!normalized.length) {
    await supabase.from("agent_memory").delete().eq("key", MEMORY_KEY_PENDING_TOPICS);
    return;
  }
  await supabase.from("agent_memory").upsert({
    key: MEMORY_KEY_PENDING_TOPICS,
    content: JSON.stringify(normalized),
    updated_at: new Date().toISOString(),
  });
}

export async function clearPendingTopics(): Promise<void> {
  const supabase = requireAgentSupabase();
  await supabase.from("agent_memory").delete().eq("key", MEMORY_KEY_PENDING_TOPICS);
}

/** Cron 실행 시점(≈08:00 KST)에 보고를 돌릴지 판단 */
export function evaluateReportSchedule(
  kst: KstDateTime,
  schedule: MeetingScheduleConfig,
): { run: boolean; reason: string; kind: "first" | "weekly" | null } {
  if (kst.hour < 7 || kst.hour > 9) {
    return { run: false, reason: "outside_kst_08_window", kind: null };
  }

  if (!schedule.firstReportCompleted && kst.dateKey === schedule.firstReportDate) {
    return { run: true, reason: "first_report", kind: "first" };
  }

  if (kst.dayOfWeek === schedule.weeklyDay) {
    return { run: true, reason: "weekly_sunday", kind: "weekly" };
  }

  return { run: false, reason: "not_scheduled", kind: null };
}

export function formatScheduleSummary(schedule: MeetingScheduleConfig, kst: KstDateTime): string {
  const first = schedule.firstReportCompleted
    ? "완료됨"
    : `${schedule.firstReportDate} 08:00 KST (첫 보고)`;
  return `현재(KST): ${kst.dateKey} · 첫 보고: ${first} · 이후: 매주 일요일 08:00 KST`;
}
