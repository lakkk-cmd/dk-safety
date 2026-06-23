"use client";

import { useState } from "react";
import { BigButton } from "@/components/ui/big-button";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { BottomSheet } from "@/components/ui/bottom-sheet";

export default function OverlayDemo() {
  const [showLoading, setShowLoading] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-dk-navy">LoadingOverlay / BottomSheet</h2>
      <BigButton variant="secondary" icon="⏳" onClick={() => setShowLoading(true)}>
        LoadingOverlay 미리보기
      </BigButton>
      <BigButton variant="secondary" icon="📄" onClick={() => setShowSheet(true)}>
        BottomSheet 미리보기
      </BigButton>

      {showLoading ? (
        <div onClick={() => setShowLoading(false)}>
          <LoadingOverlay
            title="진단 리포트 생성 중"
            steps={[
              { label: "AI 소견 생성 중...", status: "done" },
              { label: "PDF 리포트 생성 중...", status: "running" },
              { label: "카카오 알림톡 발송 중...", status: "pending" }
            ]}
          />
        </div>
      ) : null}

      <BottomSheet open={showSheet} onClose={() => setShowSheet(false)} title="예약을 취소할까요?">
        <p className="text-[15px] text-slate-600">취소 후에는 다시 예약해야 합니다.</p>
        <div className="mt-4 flex gap-2">
          <BigButton variant="ghost" onClick={() => setShowSheet(false)}>
            아니요
          </BigButton>
          <BigButton variant="danger" onClick={() => setShowSheet(false)}>
            취소합니다
          </BigButton>
        </div>
      </BottomSheet>
    </section>
  );
}
