"use client";

import { useCallback, useEffect, useState } from "react";

type ManagerInfo = { id: string; name: string; phone: string; loginId: string };
type ApartmentInfo = { id: string; name: string; totalUnits: number | null };
type MeResponse = { manager?: ManagerInfo; apartment?: ApartmentInfo; message?: string };

const PHONE_RE = /^01[0-9]-?\d{3,4}-?\d{4}$/;

export default function AptManagerInfoPanel() {
  const [manager, setManager] = useState<ManagerInfo | null>(null);
  const [apartment, setApartment] = useState<ApartmentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/apt-manager/me", { cache: "no-store" });
      const data = (await response.json()) as MeResponse;
      if (!response.ok || !data.manager) {
        setProfileMessage(data.message ?? "정보를 불러오지 못했습니다.");
        return;
      }
      setManager(data.manager);
      setApartment(data.apartment ?? null);
      setName(data.manager.name);
      setPhone(data.manager.phone);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = async () => {
    setProfileMessage("");
    if (!name.trim()) {
      setProfileMessage("이름을 입력해주세요.");
      return;
    }
    if (!PHONE_RE.test(phone.trim())) {
      setProfileMessage("연락처 형식이 올바르지 않습니다. (예: 010-1234-5678)");
      return;
    }
    setProfileBusy(true);
    try {
      const response = await fetch("/api/apt-manager/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() })
      });
      const data = (await response.json()) as MeResponse;
      if (!response.ok) {
        setProfileMessage(data.message ?? "수정에 실패했습니다.");
        return;
      }
      if (data.manager) setManager(data.manager);
      setProfileMessage("개인정보가 수정되었습니다.");
    } catch {
      setProfileMessage("수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setProfileBusy(false);
    }
  };

  const changePassword = async () => {
    setPasswordMessage("");
    if (!currentPassword) {
      setPasswordMessage("현재 비밀번호를 입력해주세요.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMessage("새 비밀번호는 8자 이상으로 입력해주세요.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordMessage("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    setPasswordBusy(true);
    try {
      const response = await fetch("/api/apt-manager/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setPasswordMessage(data.message ?? "비밀번호 변경에 실패했습니다.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordMessage("비밀번호가 변경되었습니다.");
    } catch {
      setPasswordMessage("비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setPasswordBusy(false);
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-500">불러오는 중...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[13px] font-semibold text-slate-500">소속 단지</p>
        <p className="mt-1 text-base font-bold text-dk-navy">{apartment?.name ?? "-"}</p>
        <p className="mt-0.5 text-xs text-slate-400">아이디 {manager?.loginId ?? "-"} · 단지 정보 변경은 대경이엔피(010-8945-1111)로 문의해주세요.</p>
      </div>

      <div className="rounded-2xl border border-dk-blue/20 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-dk-navy">담당자 개인정보</p>
        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            className="soft-input w-full"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="연락처 (예: 010-1234-5678)"
            inputMode="tel"
            className="soft-input w-full"
          />
        </div>
        <button
          type="button"
          disabled={profileBusy}
          onClick={() => void saveProfile()}
          className="mt-3 w-full rounded-xl bg-dk-blue py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {profileBusy ? "저장 중..." : "개인정보 저장"}
        </button>
        {profileMessage ? <p className="mt-2 text-[13px] text-slate-600">{profileMessage}</p> : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-dk-navy">비밀번호 변경</p>
        <p className="mt-0.5 text-xs text-slate-400">관리자가 초기화해 문자로 받은 임시 비밀번호는 여기서 바로 바꿀 수 있어요.</p>
        <div className="mt-3 space-y-2">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="현재 비밀번호"
            autoComplete="current-password"
            className="soft-input w-full"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="새 비밀번호 (8자 이상)"
            autoComplete="new-password"
            className="soft-input w-full"
          />
          <input
            type="password"
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            placeholder="새 비밀번호 확인"
            autoComplete="new-password"
            className="soft-input w-full"
          />
        </div>
        <button
          type="button"
          disabled={passwordBusy}
          onClick={() => void changePassword()}
          className="mt-3 w-full rounded-xl border border-dk-blue py-2.5 text-sm font-bold text-dk-blue disabled:opacity-50"
        >
          {passwordBusy ? "변경 중..." : "비밀번호 변경"}
        </button>
        {passwordMessage ? <p className="mt-2 text-[13px] text-slate-600">{passwordMessage}</p> : null}
      </div>
    </div>
  );
}
