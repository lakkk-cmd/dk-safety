import { NextResponse } from "next/server";
import { getNationalApartmentSuggestions } from "@/lib/national-apartment-suggest";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 1) {
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions = await getNationalApartmentSuggestions(q, 10);

  return NextResponse.json({ suggestions });
}
