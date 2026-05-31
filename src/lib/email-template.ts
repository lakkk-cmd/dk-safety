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

export function buildEmailHTML(
  sections: ReportSection[],
  date: string,
  dailyChiefSummary?: string,
  feedbackApplied?: string | null,
): string {
  const agentBlocks = (responses: AgentResponse[]) =>
    responses
      .map((r) => {
        const c = AGENT_COLORS[r.agent.id] ?? { bg: "#F1EFE8", border: "#5F5E5A", text: "#2C2C2A" };
        const formatted = r.response
          .split("\n")
          .map((line) => `<p style="margin:4px 0;line-height:1.7">${line}</p>`)
          .join("");
        return `
      <div style="margin-bottom:16px;border-radius:10px;overflow:hidden;border:1px solid ${c.border}20">
        <div style="background:${c.bg};padding:8px 16px;border-bottom:1px solid ${c.border}30">
          <span style="font-weight:600;color:${c.text};font-size:13px">${r.agent.name} <span style="font-weight:400;opacity:.7">${r.agent.role}</span></span>
        </div>
        <div style="padding:12px 16px;background:#ffffff;font-size:13px;color:#333;line-height:1.75">${formatted}</div>
      </div>`;
      })
      .join("");

  const sectionBlocks = sections
    .map((s, i) => {
      const chiefBlock = s.chiefSummary
        ? `<div style="margin-bottom:20px;padding:16px 18px;background:#111;border-radius:10px;color:#f5f5f3;font-size:13px;line-height:1.8">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#888">총괄 코디네이터 종합</p>
          ${s.chiefSummary.split("\n").map((l) => `<p style="margin:4px 0">${l}</p>`).join("")}
        </div>`
        : "";
      return `
    <div style="margin-bottom:36px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="width:26px;height:26px;border-radius:50%;background:#111;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</div>
        <h2 style="margin:0;font-size:16px;font-weight:600;color:#111">${s.topic}</h2>
      </div>
      ${chiefBlock}
      <p style="margin:0 0 12px;font-size:12px;color:#888">2라운드 최종 의견 (6인 경영진)</p>
      ${agentBlocks(s.responses)}
    </div>`;
    })
    .join('<hr style="border:none;border-top:1px solid #eee;margin:8px 0 32px">');

  const dailyBlock = dailyChiefSummary
    ? `<div style="margin-bottom:28px;padding:18px 20px;background:#f0f0ec;border-radius:10px;border-left:4px solid #111">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#555">오늘 전체 경영 회의 요약</p>
        <div style="font-size:13px;color:#333;line-height:1.8;white-space:pre-wrap">${dailyChiefSummary}</div>
      </div>`
    : "";

  const feedbackBlock = feedbackApplied
    ? `<p style="margin:0 0 20px;padding:12px 14px;background:#fff8e6;border-radius:8px;font-size:13px;color:#633806;line-height:1.6">
        ✓ 이번 회의에 반영된 대장 지시: ${feedbackApplied.slice(0, 300)}${feedbackApplied.length > 300 ? "…" : ""}
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>대경안심전기 경영진 보고서</title></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden">
    <div style="background:#111;padding:28px 32px">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:.1em;color:#888;text-transform:uppercase">Executive Council</p>
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#fff">경영진 회의 보고서</h1>
      <p style="margin:0;font-size:13px;color:#aaa">${date} · 우리집 안심전기 · 2라운드 토론 + 총괄 종합</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 28px;font-size:14px;color:#555;line-height:1.7;border-left:3px solid #111;padding-left:14px">
        대장, 오늘의 6인 경영진 회의(2라운드 토론) 결과입니다.<br>총괄 코디네이터가 종합한 실행 우선순위를 확인하세요.
      </p>
      ${feedbackBlock}
      ${dailyBlock}
      ${sectionBlocks}
      <div style="background:#f9f9f7;border-radius:8px;padding:14px 16px;font-size:12px;color:#888;line-height:1.7">
        피드백·보고 이력: <a href="https://dkansim.com/admin/command-center" style="color:#111;font-weight:600">관리자 사령부</a>
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
): string {
  const lines: string[] = [`[대경안심전기] 경영진 회의 보고 — ${date}`, "=".repeat(50), ""];
  if (feedbackApplied) {
    lines.push(`[대장 지시 반영]\n${feedbackApplied}\n`);
  }
  if (dailyChiefSummary) {
    lines.push("[오늘 전체 요약]", dailyChiefSummary, "");
  }
  sections.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.topic}`);
    lines.push("-".repeat(40));
    if (s.chiefSummary) {
      lines.push("\n[총괄 종합]");
      lines.push(s.chiefSummary);
    }
    lines.push("\n[2라운드 최종 의견]");
    s.responses.forEach((r) => {
      lines.push(`\n▸ ${r.agent.name} (${r.agent.role})`);
      lines.push(r.response);
    });
    lines.push("");
  });
  lines.push("=".repeat(50));
  lines.push("사령부: https://dkansim.com/admin/command-center");
  return lines.join("\n");
}
