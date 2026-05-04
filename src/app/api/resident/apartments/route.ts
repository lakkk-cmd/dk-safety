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
  let body: { name?: string; address?: string; addressType?: "road" | "jibun" } = {};
  try {
    body = (await request.json()) as { name?: string; address?: string; addressType?: "road" | "jibun" };
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const name = body.name?.trim() ?? "";
  const address = body.address?.trim() ?? "";
  const addressType = body.addressType;
  if (!name) {
    return NextResponse.json({ message: "아파트명을 입력해주세요." }, { status: 400 });
  }
  if (!address) {
    return NextResponse.json({ message: "아파트 주소를 입력해주세요." }, { status: 400 });
  }
  if (addressType !== "road" && addressType !== "jibun") {
    return NextResponse.json({ message: "주소 유형(도로명/지번)을 선택해주세요." }, { status: 400 });
  }

  try {
    const apartment = await addApartment(name, address, addressType);
    return NextResponse.json({ message: "아파트가 추가되었습니다.", apartment }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "아파트 추가 실패" }, { status: 400 });
  }
}
