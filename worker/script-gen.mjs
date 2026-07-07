/**
 * 4단계: Claude API 대본 생성 — scenes가 없는 video_jobs 작업의 대본을
 * video-orchestrator-system-prompt.md 기반으로 생성한다.
 * env: ANTHROPIC_API_KEY (필수), ANTHROPIC_MODEL (기본 claude-sonnet-4-6)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
const MAX_TOKENS = 8000; // 대본 전체가 잘리지 않도록 넉넉히 (maxTokens 부족 버그 재발 방지)
const KNOWN_COMPOSITIONS = new Set(["HookTitle", "Checklist", "Diagram", "CTA"]);

let systemPromptCache = null;
function getSystemPrompt() {
  systemPromptCache ??= readFileSync(
    path.join(__dirname, "video-orchestrator-system-prompt.md"),
    "utf8"
  );
  return systemPromptCache;
}

/**
 * src/lib/agents.ts extractJsonBlock 포팅 — 중괄호 깊이를 직접 추적해
 * JSON 문자열 값 내부의 ``` 펜스/중첩 {}에 안전하다.
 */
export function extractJsonBlock(text) {
  const fenceMatch = text.match(/```json\s*\n?/);
  const start = fenceMatch
    ? text.indexOf("{", fenceMatch.index + fenceMatch[0].length)
    : text.indexOf("{");
  if (start === -1) return "";

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1).trim();
    }
  }
  return "";
}

function validateScript(script) {
  if (!script?.title || !Array.isArray(script.scenes) || script.scenes.length === 0) {
    throw new Error("대본 형식 오류: title/scenes 누락");
  }
  for (const [i, scene] of script.scenes.entries()) {
    if (!KNOWN_COMPOSITIONS.has(scene.compositionId)) {
      throw new Error(`대본 형식 오류: scenes[${i}] 미등록 템플릿 "${scene.compositionId}"`);
    }
    if (!scene.props || typeof scene.props !== "object") {
      throw new Error(`대본 형식 오류: scenes[${i}] props 누락`);
    }
    if (typeof scene.narration !== "string" || !scene.narration.trim()) {
      throw new Error(`대본 형식 오류: scenes[${i}] narration 누락`);
    }
  }
  return script;
}

/**
 * topic/format으로 대본 생성 → { title, description, tags, scenes } 반환.
 * scenes: [{ compositionId, props, narration }]
 */
export async function generateScript({ topic, format }) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("scenes가 없고 ANTHROPIC_API_KEY도 없어 대본을 생성할 수 없습니다");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: getSystemPrompt(),
      messages: [
        {
          role: "user",
          content: `영상 주제: ${topic}\nformat: ${format}\n\n위 주제로 씬 대본 JSON을 작성하라.`,
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude API 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const jsonText = extractJsonBlock(text);
  if (!jsonText) throw new Error("Claude 응답에서 JSON을 찾지 못했습니다");
  return validateScript(JSON.parse(jsonText));
}
