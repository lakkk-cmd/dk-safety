import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import {
  DEFAULT_MEETING_TOPICS,
  clearPendingTopics,
  formatScheduleSummary,
  getKstDateTime,
  loadMeetingSchedule,
  loadPendingTopics,
  savePendingTopics,
} from "@/lib/agent-schedule";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  try {
    const kst = getKstDateTime();
    const schedule = await loadMeetingSchedule();
    const topics = await loadPendingTopics();

    return NextResponse.json({
      schedule,
      topics,
      defaultTopics: DEFAULT_MEETING_TOPICS,
      scheduleSummary: formatScheduleSummary(schedule, kst),
      nextRunHint:
        topics.length > 0
          ? `저장된 주제 ${topics.length}개가 다음 회의에 사용됩니다.`
          : "회의 주제를 입력·저장해 주세요.",
      kstNow: kst,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  let body: { topics?: string[]; topicsText?: string } = {};
  try {
    body = (await request.json()) as { topics?: string[]; topicsText?: string };
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  let topics: string[] = [];
  if (Array.isArray(body.topics)) {
    topics = body.topics.map(String);
  } else if (typeof body.topicsText === "string") {
    topics = body.topicsText.split("\n");
  }

  topics = topics.map((t) => t.trim()).filter((t) => t.length >= 2).slice(0, 8);
  if (!topics.length) {
    return NextResponse.json({ message: "회의 주제를 한 줄에 하나씩, 2자 이상으로 입력해 주세요." }, { status: 400 });
  }

  try {
    await savePendingTopics(topics);
    const schedule = await loadMeetingSchedule();
    const kst = getKstDateTime();

    return NextResponse.json({
      ok: true,
      topics,
      schedule,
      scheduleSummary: formatScheduleSummary(schedule, kst),
      message: `회의 주제 ${topics.length}개가 저장되었습니다. 첫 보고: ${schedule.firstReportDate} 08:00 KST · 이후 매주 일요일 08:00.`,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "저장 실패" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "true";
  const topic = searchParams.get("topic");

  try {
    if (all) {
      await clearPendingTopics();
      return NextResponse.json({ ok: true, topics: [], message: "모든 회의 주제가 삭제되었습니다." });
    }
    if (!topic) {
      return NextResponse.json({ message: "topic 또는 all 파라미터가 필요합니다." }, { status: 400 });
    }
    const current = await loadPendingTopics();
    const updated = current.filter((t) => t !== topic);
    if (updated.length === current.length) {
      return NextResponse.json({ message: "해당 주제를 찾을 수 없습니다." }, { status: 404 });
    }
    await savePendingTopics(updated);
    return NextResponse.json({ ok: true, topics: updated, message: "주제가 삭제되었습니다." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "삭제 실패" },
      { status: 500 },
    );
  }
}
