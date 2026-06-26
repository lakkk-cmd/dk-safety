export interface DecisionItem {
  decision_type: "pricing" | "cta" | "notice" | "service" | "content" | "booking";
  target_page: "main" | "service" | "booking" | "content" | "all";
  key: string;
  value: string;
  label?: string;
}

export async function applyDecision(
  decisions: DecisionItem[],
  session_id: string,
): Promise<{ success: boolean; applied_count: number }> {
  try {
    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.NEXT_PUBLIC_BASE_URL ??
      "http://localhost:3000"
    ).replace(/\/$/, "");

    const res = await fetch(`${baseUrl}/api/chat/decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "dk_admin_auth=ok",
      },
      body: JSON.stringify({ session_id, decisions }),
      cache: "no-store",
    });
    return (await res.json()) as { success: boolean; applied_count: number };
  } catch (e) {
    console.error("applyDecision 실패:", e);
    return { success: false, applied_count: 0 };
  }
}
