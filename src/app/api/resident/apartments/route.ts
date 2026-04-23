import { NextResponse } from "next/server";
import { addApartment, listApartments } from "@/lib/resident-db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const apartments = await listApartments();
    return NextResponse.json({ apartments });
  } catch (error) {
    console.error("[api/resident/apartments]", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "아파트 목록을 불러오지 못했습니다.",
        apartments: [] as unknown[]
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ message: "아파트명을 입력해주세요." }, { status: 400 });
  }

  try {
    const apartment = await addApartment(name);
    return NextResponse.json({ message: "아파트가 추가되었습니다.", apartment }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "아파트 추가 실패" }, { status: 400 });
  }
}
