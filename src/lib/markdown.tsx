import type { ReactNode } from "react";

/** "**bold**" 인라인 마크업만 지원하는 가벼운 렌더러 (XSS 방지를 위해 React 엘리먼트로 직접 렌더링) */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<strong key={`${keyPrefix}-${i++}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/** 블로그 본문(`## 소제목`, 목록, 굵게)을 위한 가벼운 마크다운 → React 렌더러 */
export function renderMarkdown(content: string): ReactNode {
  const lines = content.split("\n");
  const elements: ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (!listItems.length || !listType) return;
    const items = listItems.map((item, i) => (
      <li key={`li-${elements.length}-${i}`}>{renderInline(item, `li-${elements.length}-${i}`)}</li>
    ));
    if (listType === "ol") {
      elements.push(
        <ol key={`list-${elements.length}`} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>,
      );
    } else {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc space-y-1 pl-5">
          {items}
        </ul>,
      );
    }
    listItems = [];
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={`h-${elements.length}`} className="mt-4 text-base font-bold text-slate-900">
          {renderInline(line.slice(4), `h3-${elements.length}`)}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("## ") || line.startsWith("# ")) {
      flushList();
      const text = line.startsWith("## ") ? line.slice(3) : line.slice(2);
      elements.push(
        <h2 key={`h-${elements.length}`} className="mt-6 text-lg font-bold text-slate-900 md:text-xl">
          {renderInline(text, `h2-${elements.length}`)}
        </h2>,
      );
      continue;
    }
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(ulMatch[1]);
      continue;
    }
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(olMatch[1]);
      continue;
    }
    flushList();
    elements.push(
      <p key={`p-${elements.length}`} className="leading-7 text-slate-700">
        {renderInline(line, `p-${elements.length}`)}
      </p>,
    );
  }
  flushList();

  return <>{elements}</>;
}
