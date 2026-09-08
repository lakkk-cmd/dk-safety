"use client";

import { useState } from "react";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  items: string;
  purpose: string;
  retention: string;
  className?: string;
};

/**
 * 개인정보 수집·이용 동의 체크박스 — 예약폼/전기과장 가입폼/세대방문점검 서명화면 등 실제로
 * 개인정보를 입력받는 지점마다 재사용한다(2026-09-08, /privacy 페이지 신설과 같은 세션).
 * 개인정보보호법 제15조·제22조상 수집 시점에 항목·목적·보유기간·동의거부권을 고지하고
 * 동의를 받아야 하므로, 방침 페이지 링크만으로는 부족하고 이 체크박스 자체가 필요하다.
 */
export default function PrivacyConsentCheckbox({ checked, onChange, items, purpose, retention, className }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 ${className ?? ""}`}>
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-dk-blue"
        />
        <span className="leading-relaxed">
          <span className="font-bold text-rose-600">[필수]</span> 개인정보 수집·이용에 동의합니다.{" "}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setExpanded((v) => !v);
            }}
            className="font-semibold text-dk-blue underline underline-offset-2"
          >
            {expanded ? "접기" : "자세히 보기"}
          </button>
        </span>
      </label>
      {expanded ? (
        <div className="mt-2 space-y-1 border-t border-slate-200 pl-6 pt-2">
          <p>· 수집항목: {items}</p>
          <p>· 수집목적: {purpose}</p>
          <p>· 보유기간: {retention}</p>
          <p>
            동의를 거부할 권리가 있으며, 다만 위 항목은 서비스 제공에 필요한 정보라 동의하지 않으시면 서비스 이용이
            제한될 수 있습니다. 자세한 내용은{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-dk-blue underline underline-offset-2">
              개인정보처리방침
            </a>
            을 확인해주세요.
          </p>
        </div>
      ) : null}
    </div>
  );
}
