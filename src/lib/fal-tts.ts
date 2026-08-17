/**
 * fal.ai 호스팅 Qwen3-TTS — hq 채팅 "들려주기" 버튼용. GPU 서버 관리 없이 API 키만으로 동작한다.
 * queue 기반 REST API(submit → status 폴링 → result 조회) — 공식 curl 예시와 동일한 패턴.
 * 1,000자당 $0.09 (2026-08-17 fal.ai 확인).
 */

const FAL_KEY = process.env.FAL_API_KEY?.trim();
export const FAL_TTS_ENABLED = Boolean(FAL_KEY);

const FAL_TTS_MODEL = "fal-ai/qwen-3-tts/text-to-speech/1.7b";
const FAL_CLONE_MODEL = "fal-ai/qwen-3-tts/clone-voice/1.7b";

async function falSubmitAndWait(modelId: string, input: Record<string, unknown>, timeoutMs = 60_000): Promise<unknown> {
  if (!FAL_KEY) throw new Error("FAL_API_KEY 없음");

  const submitRes = await fetch(`https://queue.fal.run/${modelId}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!submitRes.ok) {
    throw new Error(`fal.ai 요청 실패 (${submitRes.status}): ${(await submitRes.text()).slice(0, 200)}`);
  }
  const submitData = (await submitRes.json()) as { request_id: string };
  const requestId = submitData.request_id;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const statusRes = await fetch(`https://queue.fal.run/${modelId}/requests/${requestId}/status`, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
    const statusData = (await statusRes.json()) as { status: string };
    if (statusData.status === "COMPLETED") {
      const resultRes = await fetch(`https://queue.fal.run/${modelId}/requests/${requestId}`, {
        headers: { Authorization: `Key ${FAL_KEY}` },
      });
      if (!resultRes.ok) throw new Error(`fal.ai 결과 조회 실패 (${resultRes.status})`);
      return resultRes.json();
    }
    if (statusData.status === "ERROR") {
      throw new Error(`fal.ai 생성 실패: ${JSON.stringify(statusData).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("fal.ai 응답 시간 초과");
}

/**
 * 채팅 답변의 마크다운 서식을 읽을 때 어색하지 않게 제거한다("샵샵 저 풀의 업무범위 대시대시대시" 방지).
 * 완벽한 마크다운 파서가 아니라, TTS 입력 전처리용 가벼운 치환이다.
 */
export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "") // 코드 블록 통째로 제외
    .replace(/^#{1,6}\s*/gm, "") // 헤딩 마커
    .replace(/\*\*(.+?)\*\*/g, "$1") // 볼드
    .replace(/\*(.+?)\*/g, "$1") // 이탤릭
    .replace(/`([^`]+)`/g, "$1") // 인라인 코드
    .replace(/^\s*[-*]{3,}\s*$/gm, "") // 구분선
    .replace(/^\s*[-*+]\s+/gm, "") // 불릿 마커
    .replace(/\|/g, " ") // 표 구분자
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 링크 → 텍스트만
    .replace(/[#*`|]/g, "") // 잔여 기호
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export async function synthesizeSpeechFal(text: string): Promise<{ url: string; durationSec: number }> {
  const embeddingUrl = process.env.FAL_SPEAKER_EMBEDDING_URL?.trim();
  if (!embeddingUrl) throw new Error("FAL_SPEAKER_EMBEDDING_URL이 설정되지 않았습니다 — 목소리 클론이 아직 등록되지 않았습니다.");

  const result = (await falSubmitAndWait(FAL_TTS_MODEL, {
    text: stripMarkdownForSpeech(text),
    language: "Korean",
    speaker_voice_embedding_file_url: embeddingUrl,
  })) as { audio: { url: string; duration: number } };

  return { url: result.audio.url, durationSec: result.audio.duration };
}

/** 1회성 목소리 클론 등록 스크립트(scripts/clone-voice-fal.mjs)에서 재사용하는 로직과 동일한 계약. */
export async function cloneVoiceFal(audioUrl: string, referenceText?: string): Promise<string> {
  const result = (await falSubmitAndWait(FAL_CLONE_MODEL, {
    audio_url: audioUrl,
    ...(referenceText ? { reference_text: referenceText } : {}),
  })) as { speaker_embedding: { url: string } };
  return result.speaker_embedding.url;
}
