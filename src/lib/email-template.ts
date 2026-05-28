import type { AgentResponse } from "./agents";

const AGENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  cto: { bg: "#E6F1FB", border: "#185FA5", text: "#0C447C" },
  cso: { bg: "#E1F5EE", border: "#0F6E56", text: "#085041" },
  cmo: { bg: "#FAEEDA", border: "#854F0B", text: "#633806" },
  coo: { bg: "#FAECE7", border: "#993C1D", text: "#712B13" },
  cfo: { bg: "#EAF3DE", border: "#3B6D11", text: "#27500A" },
  clo: { bg: "#EEEDFE", border: "#534AB7", text: "#3C3489" },
};

interface ReportSection {
  topic: string;
  responses: AgentResponse[];
}

export function buildEmailHTML(sections: ReportSection[], date: string): string {
  const agentBlocks = (responses: AgentResponse[]) =>
    responses.map((r) => {
      const c = AGENT_COLORS[r.agent.id] ?? { bg: "#F1EFE8", border: "#5F5E5A", text: "#2C2C2A" };
      const formatted = r.response.split("\n").map((line) => `<p style="margin:4px 0;line-height:1.7">${line}</p>`).join("");
      return `
      <div style="margin-bottom:16px;border-radius:10px;overflow:hidden;border:1px solid ${c.border}20">
        <div style="background:${c.bg};padding:8px 16px;border-bottom:1px solid ${c.border}30">
          <span style="font-weight:600;color:${c.text};font-size:13px">${r.agent.name} <span style="font-weight:400;opacity:.7">${r.agent.role}</span></span>
        </div>
        <div style="padding:12px 16px;background:#ffffff;font-size:13px;color:#333;line-height:1.75">${formatted}</div>
      </div>`;
    }).join("");

  const sectionBlocks = sections.map((s, i) => `
    <div style="margin-bottom:36px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="width:26px;height:26px;border-radius:50%;background:#111;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</div>
        <h2 style="margin:0;font-size:16px;font-weight:600;color:#111">${s.topic}</h2>
      </div>
      ${agentBlocks(s.responses)}
    </div>`
  ).join('<hr style="border:none;border-top:1px solid #eee;margin:8px 0 32px">');

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>대경안심전기 에이전트 보고서</title></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden">
    <div style="background:#111;padding:28px 32px">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:.1em;color:#888;text-transform:uppercase">Daily Report</p>
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#fff">에이전트 보고서</h1>
      <p style="margin:0;font-size:13px;color:#aaa">${date} · 우리집 안심전기</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 28px;font-size:14px;color:#555;line-height:1.7;border-left:3px solid #111;padding-left:14px">
        대장, 오늘의 에이전트 보고서입니다.<br>${sections.length}개 주제에 대해 6명의 전문 에이전트가 분석했습니다.
      </p>
      ${sectionBlocks}
      <div style="background:#f9f9f7;border-radius:8px;padding:14px 16px;font-size:12px;color:#888;line-height:1.7">
        피드백은 <a href="https://dkansim.com" style="color:#111;font-weight:600">dkansim.com</a> 사령부에서 입력하시면 다음 보고서에 반영됩니다.
      </div>
    </div>
    <div style="background:#f5f5f3;padding:16px 32px;text-align:center">
      <p style="margin:0;font-size:11px;color:#bbb">대경안심전기 · 광주광역시 · dkansim.com</p>
    </div>
  </div>
</body>
</html>`.trim();
}

export function buildEmailText(sections: ReportSection[], date: string): string {
  const lines: string[] = [`[대경안심전기] 에이전트 보고서 — ${date}`, "=".repeat(50), ""];
  sections.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.topic}`);
    lines.push("-".repeat(40));
    s.responses.forEach((r) => {
      lines.push(`\n▸ ${r.agent.name} (${r.agent.role})`);
      lines.push(r.response);
    });
    lines.push("");
  });
  lines.push("=".repeat(50));
  lines.push("피드백: https://dkansim.com");
  return lines.join("\n");
}