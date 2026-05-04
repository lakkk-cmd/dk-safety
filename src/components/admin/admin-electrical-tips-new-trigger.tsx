"use client";

import { Button } from "@/components/ui/button";

export default function AdminElectricalTipsNewTrigger({ disabled }: { disabled?: boolean }) {
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={() => window.dispatchEvent(new CustomEvent("electrical-tips:open-create"))}
    >
      새 콘텐츠 작성
    </Button>
  );
}
