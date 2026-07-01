import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { listWorkers, createWorker } from "@/lib/erp-db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const workers = await listWorkers();
    return NextResponse.json({ workers });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = await req.json() as {
      name: string;
      phone: string;
      worker_type?: string;
      specialty?: string[];
      hourly_rate?: number | null;
      daily_rate?: number | null;
      worker_note?: string | null;
      certifications?: string | null;
    };

    const worker = await createWorker({
      name: body.name,
      phone: body.phone,
      worker_type: (body.worker_type ?? "employee") as "employee" | "contractor",
      specialty: body.specialty ?? [],
      hourly_rate: body.hourly_rate ?? null,
      daily_rate: body.daily_rate ?? null,
      worker_note: body.worker_note ?? null,
      certifications: body.certifications ?? null,
    });
    return NextResponse.json({ worker });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
