import { cookies } from "next/headers";
import { pgListTasksForWorker } from "@/lib/reservations-pg";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function snapshot(items: Awaited<ReturnType<typeof pgListTasksForWorker>>) {
  return JSON.stringify(
    items.map((row) => [
      row.task.id,
      row.task.status,
      row.task.site_photo_urls?.length ?? 0,
      row.reservation.status,
      row.reservation.name
    ])
  );
}

export async function GET(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return new Response("Supabase DB 모드가 아닙니다.", { status: 400 });
  }

  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  if (!session) {
    return new Response("로그인이 필요합니다.", { status: 401 });
  }

  const workerId = session.workerId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let last = "";
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      const tick = async () => {
        if (request.signal.aborted) {
          return;
        }
        try {
          const items = await pgListTasksForWorker(workerId);
          const next = snapshot(items);
          if (next !== last) {
            last = next;
            send({ type: "tasks", items });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "조회 실패";
          send({ type: "error", message });
        }
      };

      send({ type: "connected" });
      await tick();
      const interval = setInterval(() => {
        void tick();
      }, 500);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
