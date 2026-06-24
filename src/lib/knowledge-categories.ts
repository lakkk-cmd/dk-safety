/** /admin/knowledge 카테고리 상수 — 클라이언트 컴포넌트에서도 안전하게 import할 수 있도록 pdf-parse 의존성과 분리 */

export const KNOWLEDGE_CATEGORIES = [
  { key: "regulation", label: "전기법령" },
  { key: "technical", label: "전기기술" },
  { key: "content_youtube", label: "유튜브" },
  { key: "content_blog", label: "블로그" },
  { key: "marketing", label: "마케팅" },
  { key: "ai_automation", label: "AI자동화" },
  { key: "business", label: "사업경영" },
  { key: "general", label: "일반" }
] as const;

export type KnowledgeCategoryKey = (typeof KNOWLEDGE_CATEGORIES)[number]["key"];

export function categoryLabel(key: string | null): string {
  return KNOWLEDGE_CATEGORIES.find((c) => c.key === key)?.label ?? key ?? "미분류";
}
