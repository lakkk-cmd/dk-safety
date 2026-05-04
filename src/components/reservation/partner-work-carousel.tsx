"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/** 전기 안전·현장 전문성을 보여주는 스톡 이미지 (Unsplash — 배전·배선·현장 작업 위주, 비전기·사무실 느낌 사진 제외) */
const SLIDES: Array<{ src: string; alt: string }> = [
  {
    src: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1200&q=80",
    alt: "전기 배전반 점검 작업"
  },
  {
    src: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1200&q=80",
    alt: "현장 안전 장비를 착용한 전기 작업"
  },
  {
    src: "https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=1200&q=80",
    alt: "전기 설비 유지보수"
  },
  {
    src: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1200&q=80",
    alt: "전기 공사·배선 점검"
  }
];

const INTERVAL_MS = 4500;

export default function PartnerWorkCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % SLIDES.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="partner-panel-glass overflow-hidden p-4 sm:p-5" aria-label="전기 안전 전문 현장 사진">
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-[rgba(44,40,37,0.08)] bg-[#ece8e3] shadow-inner">
        {SLIDES.map((slide, index) => (
          <Image
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            fill
            sizes="(max-width: 768px) 100vw, 672px"
            priority={index === 0}
            className={`pointer-events-none object-cover transition-opacity duration-[1100ms] ease-in-out ${
              index === active ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        {SLIDES.map((_, index) => (
          <button
            key={index}
            type="button"
            aria-label={`${index + 1}번째 사진 보기`}
            aria-current={index === active}
            onClick={() => setActive(index)}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === active ? "w-7 bg-[#cf6b4e]" : "w-2 bg-[#d4cec7] hover:bg-[#b8afa7]"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
