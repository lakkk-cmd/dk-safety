export interface Agent {
    id: string;
    name: string;
    role: string;
  }
  
  export interface AgentResponse {
    agent: Agent;
    response: string;
  }
  
  export const AGENTS: Agent[] = [
    { id: "cto", name: "CTO 스파크", role: "기술총괄" },
    { id: "cso", name: "CSO 브릿지", role: "전략총괄" },
    { id: "cmo", name: "CMO 확성기", role: "마케팅총괄" },
    { id: "coo", name: "COO 필드",   role: "운영총괄" },
    { id: "cfo", name: "CFO 계산기", role: "재무총괄" },
    { id: "clo", name: "CLO 규정집", role: "법무총괄" },
  ];
  
  const SYSTEM_PROMPTS: Record<string, string> = {
    cto: `당신은 대경안심전기의 CTO 스파크입니다. 기술 전문가로서 앱(FlutterFlow+Firebase), 웹(Next.js 15+Supabase+Toss Payments), KIPO 특허(14개 청구항)를 관리합니다. 기술적으로 실행 가능하고 1인 사업자에게 현실적인 솔루션만 제시합니다.`,
    cso: `당신은 대경안심전기의 CSO 브릿지입니다. 대장은 본업(아파트 전기팀장)을 병행하는 광주 기반 1인 사업자로 주말/저녁만 운영 가능합니다. 연간 관리계약은 법적으로 불가하므로 예약제 방문 서비스 중심의 현실적 성장 전략만 제시합니다.`,
    cmo: `당신은 대경안심전기의 CMO 확성기입니다. 브랜드 "우리집 안심전기"의 광주 아파트 입주민 대상 마케팅을 담당합니다. 유튜브·인스타·블로그·아파트 게시판 등 저비용 고효율 채널에 집중합니다.`,
    coo: `당신은 대경안심전기의 COO 필드입니다. 예약→방문→완료→AS 워크플로우 최적화와 현장 품질 관리를 담당합니다. dkansim.com 플랫폼을 활용한 운영 자동화와 1인 운영의 한계 극복에 집중합니다.`,
    cfo: `당신은 대경안심전기의 CFO 계산기입니다. 1인 사업자 수익 구조 최적화, 서비스 단가 전략, 종합소득세·부가세 관리를 담당합니다. 구체적인 숫자(금액, 건수, 목표)를 포함한 분석을 제공합니다.`,
    clo: `당신은 대경안심전기의 CLO 규정집입니다. 겸업 금지 리스크, 전기공사업 등록 요건, 전기안전관리자 겸직 제한을 엄격히 검토합니다. 리스크를 먼저 명확히 짚고, 합법적이고 안전한 운영 방안을 제시합니다.`,
  };
  
  export const BUSINESS_CONTEXT = `
  [대경안심전기 현황]
  - 브랜드: 우리집 안심전기 (대경안심전기, 광주광역시)
  - 사업 형태: 1인 사업자
  - 대장 제약: 본업(아파트 전기팀장) 병행, 주말/저녁만 운영
  - 법적 제약: 연간 관리계약 불가, 예약제 방문 서비스 위주
  - 플랫폼: dkansim.com (Next.js 15 + Supabase + Toss Payments)
  - 앱: FlutterFlow + Firebase
  - 특허: KIPO 출원 완료 (14개 청구항)
  `;
  
  export async function callClaude(agentId: string, userPrompt: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPTS[agentId],
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
    const data = await res.json();
    return data.content?.filter((b: {type:string}) => b.type === "text").map((b: {text:string}) => b.text).join("") || "응답 없음";
  }
  
  export async function runMeeting(topic: string, memory: string, feedback?: string): Promise<AgentResponse[]> {
    const results: AgentResponse[] = [];
    for (const agent of AGENTS) {
      const prev = results.length
        ? "이번 회의 앞선 발언:\n" + results.map(r => `[${r.agent.name}]: ${r.response}`).join("\n\n")
        : "";
      const prompt = `회의 주제: ${topic}
  ${feedback ? `대장 지시사항: ${feedback}` : ""}
  ${BUSINESS_CONTEXT}
  ${memory ? `\n누적 메모리:\n${memory}` : ""}
  ${prev ? `\n${prev}` : ""}
  
  당신의 전문 분야 관점에서:
  1. 핵심 인사이트 1가지
  2. 즉시 실행 가능한 액션 아이템 2가지 (구체적 수치/기한 포함)`.trim();
      const response = await callClaude(agent.id, prompt);
      results.push({ agent, response });
    }
    return results;
  }