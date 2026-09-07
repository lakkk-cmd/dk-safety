/**
 * 카카오 카드뉴스 생성 오케스트레이션 — 큐 항목 로드 → 슬라이드 기획(Claude) → PNG 렌더링(satori,
 * 비용 0원) → Supabase Storage 업로드 → content_kakao_queue에 결과 저장.
 * video-pipeline.ts의 produceVideoAssets()와 동일한 패턴(생성 함수 + uploadBinaryObject)을 따른다.
 */

import { requireAgentSupabase } from "./agent-db";
import { renderCardNewsSlide } from "./card-news-render";
import { planCardNewsSlides, type CardNewsSlide } from "./content-agents";
import { uploadBinaryObject } from "./supabase-server";

export async function generateKakaoCardNews(queueId: string): Promise<{ slides: CardNewsSlide[]; images: string[] }> {
  const supabase = requireAgentSupabase();
  const { data: row, error } = await supabase
    .from("content_kakao_queue")
    .select("id, title, content")
    .eq("id", queueId)
    .single();
  if (error || !row) throw error ?? new Error("카카오 큐 항목을 찾을 수 없습니다.");
  if (!row.content) throw new Error("본문이 없는 항목입니다. 먼저 카카오 포스트 초안을 작성하세요.");

  const slides = await planCardNewsSlides(row.title, row.content);

  const bucket = process.env.SUPABASE_VIDEO_BUCKET?.trim() || "dk-safety-video-assets";
  const images: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const buffer = await renderCardNewsSlide(slides[i]);
    const url = await uploadBinaryObject({
      bucket,
      objectPath: `card-news/${queueId}/${i}.png`,
      contentType: "image/png",
      data: buffer,
    });
    images.push(url);
  }

  const { error: updateError } = await supabase
    .from("content_kakao_queue")
    .update({ card_news_slides: slides, card_news_images: images, updated_at: new Date().toISOString() })
    .eq("id", queueId);
  if (updateError) throw updateError;

  return { slides, images };
}
