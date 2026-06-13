import type { AgentResponse } from "./agents";

const AGENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  cto: { bg: "#E6F1FB", border: "#185FA5", text: "#0C447C" },
  cso: { bg: "#E1F5EE", border: "#0F6E56", text: "#085041" },
  cmo: { bg: "#FAEEDA", border: "#854F0B", text: "#633806" },
  coo: { bg: "#FAECE7", border: "#993C1D", text: "#712B13" },
  cfo: { bg: "#EAF3DE", border: "#3B6D11", text: "#27500A" },
  clo: { bg: "#EEEDFE", border: "#534AB7", text: "#3C3489" },
  chief: { bg: "#1a1a1a", border: "#111", text: "#fff" },
};

export interface ReportSection {
  topic: string;
  chiefSummary?: string;
  responses: AgentResponse[];
}

export interface ContentPerformanceSummary {
  text: string;
  pending: { youtube: number; kakao: number; blog: number };
}

function firstLines(text: string, n: number): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, n)
    .join("\n");
}

function agentSummaryBlocksHTML(responses: AgentResponse[]): string {
  return responses
    .map((r) => {
      const c = AGENT_COLORS[r.agent.id] ?? { bg: "#F1EFE8", border: "#5F5E5A", text: "#2C2C2A" };
      const summary = firstLines(r.response, 3)
        .split("\n")
        .map((line) => `<p style="margin:3px 0;line-height:1.65">${line}</p>`)
        .join("");
      return `
        <div style="padding:10px 13px;background:${c.bg};border-left:3px solid ${c.border};border-radius:6px;margin-bottom:8px">
          <p style="margin:0 0 5px;font-size:11px;font-weight:700;color:${c.text}">${r.agent.name} · ${r.agent.role}</p>
          <div style="font-size:12px;color:#333">${summary}</div>
        </div>`;
    })
    .join("");
}

export function buildEmailHTML(
  sections: ReportSection[],
  date: string,
  dailyChiefSummary?: string,
  feedbackApplied?: string | null,
  contentSummary?: ContentPerformanceSummary | null,
): string {
  const feedbackBlock = feedbackApplied
    ? `<p style="margin:0 0 22px;padding:10px 14px;background:#fff8e6;border-radius:8px;font-size:12px;color:#633806;line-height:1.65">
        ✓ 대장 지시 반영: ${feedbackApplied.slice(0, 200)}${feedbackApplied.length > 200 ? "…" : ""}
      </p>`
    : "";

  const dailyBlock = dailyChiefSummary
    ? `<div style="margin-bottom:28px;padding:20px 22px;background:#111;border-radius:10px;color:#f5f5f3">
        <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#888;letter-spacing:.08em;text-transform:uppercase">총괄 종합 보고</p>
        <div style="font-size:13px;line-height:1.9;white-space:pre-wrap">${dailyChiefSummary}</div>
      </div>`
    : "";

  const contentBlock = contentSummary
    ? `<div style="margin-bottom:28px;padding:18px 20px;background:#eef6ff;border-radius:10px;border-left:4px solid #185FA5">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#0C447C;letter-spacing:.06em;text-transform:uppercase">콘텐츠 마케팅 성과</p>
        <div style="font-size:13px;color:#222;line-height:1.85;white-space:pre-wrap">${contentSummary.text}</div>
        <p style="margin:10px 0 0;font-size:12px;color:#555">
          승인 대기 — 유튜브 ${contentSummary.pending.youtube}건 · 카카오 ${contentSummary.pending.kakao}건 · 블로그 ${contentSummary.pending.blog}건
          · <a href="https://contents.dkansim.com" style="color:#185FA5;font-weight:600">콘텐츠 사령부에서 승인하기</a>
        </p>
      </div>`
    : "";

  const sectionBlocks = sections
    .map((s, i) => {
      const chiefBlock = s.chiefSummary
        ? `<div style="margin-bottom:14px;padding:14px 16px;background:#f5f5f3;border-radius:8px;border-left:4px solid #111">
            <p style="margin:0 0 7px;font-size:11px;color:#555;font-weight:700;text-transform:uppercase;letter-spacing:.06em">총괄 코디네이터</p>
            <div style="font-size:13px;color:#222;line-height:1.85;white-space:pre-wrap">${s.chiefSummary}</div>
          </div>`
        : "";
      return `
      <div style="margin-bottom:32px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <div style="width:22px;height:22px;border-radius:50%;background:#111;color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:22px;flex-shrink:0">${i + 1}</div>
          <h2 style="margin:0;font-size:15px;font-weight:600;color:#111">${s.topic}</h2>
        </div>
        ${chiefBlock}
        <p style="margin:0 0 9px;font-size:11px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:.06em">경영진 핵심 요약</p>
        ${agentSummaryBlocksHTML(s.responses)}
      </div>`;
    })
    .join('<hr style="border:none;border-top:1px solid #eee;margin:4px 0 28px">');

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>대경안심전기 경영진 보고서</title></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden">
    <div style="background:#111;padding:28px 32px">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:.1em;color:#888;text-transform:uppercase">Weekly Executive Council</p>
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#fff">주간 경영진 회의 보고서</h1>
      <p style="margin:0;font-size:13px;color:#aaa">${date} · 우리집 안심전기 · 매주 토요일</p>
    </div>
    <div style="padding:32px">
      ${feedbackBlock}
      ${dailyBlock}
      ${contentBlock}
      ${sectionBlocks}
      <div style="background:#f9f9f7;border-radius:8px;padding:14px 16px;font-size:12px;color:#888;line-height:1.7">
        피드백·보고 이력: <a href="https://hq.dkansim.com" style="color:#111;font-weight:600">관리자 사령부</a>
      </div>
    </div>
    <div style="background:#f5f5f3;padding:16px 32px;text-align:center">
      <p style="margin:0;font-size:11px;color:#bbb">대경안심전기 · 광주광역시 · dkansim.com</p>
    </div>
  </div>
</body>
</html>`.trim();
}

export function buildEmailText(
  sections: ReportSection[],
  date: string,
  dailyChiefSummary?: string,
  feedbackApplied?: string | null,
  contentSummary?: ContentPerformanceSummary | null,
): string {
  const lines: string[] = [`[대경안심전기] 경영진 회의 보고 — ${date}`, "=".repeat(50), ""];
  if (feedbackApplied) {
    lines.push(`[대장 지시 반영]\n${feedbackApplied.slice(0, 200)}\n`);
  }
  if (dailyChiefSummary) {
    lines.push("[총괄 종합 보고]", dailyChiefSummary, "");
  }
  if (contentSummary) {
    lines.push("[콘텐츠 마케팅 성과]", contentSummary.text, "");
    lines.push(
      `승인 대기 — 유튜브 ${contentSummary.pending.youtube}건 · 카카오 ${contentSummary.pending.kakao}건 · 블로그 ${contentSummary.pending.blog}건`,
      "콘텐츠 사령부: https://contents.dkansim.com",
      "",
    );
  }
  sections.forEach((s, i) => {
    lines.push(`\n${i + 1}. ${s.topic}`);
    lines.push("-".repeat(40));
    if (s.chiefSummary) {
      lines.push(`[총괄 코디네이터]\n${s.chiefSummary}\n`);
    }
    lines.push("[경영진 핵심 요약]");
    s.responses.forEach((r) => {
      lines.push(`\n▸ ${r.agent.name} (${r.agent.role})`);
      lines.push(firstLines(r.response, 3));
    });
    lines.push("");
  });
  lines.push("=".repeat(50));
  lines.push("사령부: https://hq.dkansim.com");
  return lines.join("\n");
}
