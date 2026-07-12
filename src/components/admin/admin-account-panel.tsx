"use client";

import { FormEvent, useState } from "react";

type AdminAccountPublic = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

type Props = {
  initialAccounts: AdminAccountPublic[];
};

function EditRow({ account, onUpdated }: { account: AdminAccountPublic; onUpdated: (a: AdminAccountPublic) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [phone, setPhone] = useState(account.phone);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, password: password || undefined })
      });
      const data = (await response.json()) as { message?: string; account?: AdminAccountPublic };
      if (!response.ok || !data.account) {
        setMessage(data.message ?? "수정에 실패했습니다.");
        return;
      }
      onUpdated(data.account);
      setPassword("");
      setEditing(false);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !account.active })
      });
      const data = (await response.json()) as { message?: string; account?: AdminAccountPublic };
      if (!response.ok || !data.account) {
        setMessage(data.message ?? "변경에 실패했습니다.");
        return;
      }
      onUpdated(data.account);
    } finally {
      setLoading(false);
    }
  };

  if (!editing) {
    return (
      <tr className="border-t border-slate-200 dark:border-slate-700">
        <td className="px-3 py-2 font-semibold">{account.name}</td>
        <td className="px-3 py-2">{account.phone}</td>
        <td className="px-3 py-2">{account.active ? "활성" : "비활성"}</td>
        <td className="px-3 py-2">{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("ko-KR") : "-"}</td>
        <td className="px-3 py-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-600"
            >
              수정
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void toggleActive()}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50 dark:border-slate-600"
            >
              {account.active ? "비활성화" : "활성화"}
            </button>
          </div>
          {message ? <p className="mt-1 text-[11px] text-rose-600">{message}</p> : null}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
      <td className="px-3 py-2">
        <input className="soft-input w-full text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td className="px-3 py-2">
        <input className="soft-input w-full text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </td>
      <td className="px-3 py-2" colSpan={2}>
        <input
          className="soft-input w-full text-sm"
          type="password"
          placeholder="새 비밀번호(선택)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void save()}
            className="rounded-md bg-indigo-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            저장
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(account.name);
              setPhone(account.phone);
              setPassword("");
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-600"
          >
            취소
          </button>
        </div>
        {message ? <p className="mt-1 text-[11px] text-rose-600">{message}</p> : null}
      </td>
    </tr>
  );
}

export default function AdminAccountPanel({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const addAccount = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, password })
      });
      const data = (await response.json()) as { message?: string; account?: AdminAccountPublic };
      if (!response.ok || !data.account) {
        setMessage(data.message ?? "등록에 실패했습니다.");
        return;
      }
      setAccounts((prev) => [...prev, data.account as AdminAccountPublic]);
      setName("");
      setPhone("");
      setPassword("");
      setMessage("관리자 계정이 등록되었습니다.");
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="surface-card rounded-2xl border border-slate-200 p-5">
        <h2 className="text-lg font-black text-slate-950">새 관리자 계정 추가</h2>
        <p className="mt-1 text-xs text-slate-600">
          이름/연락처/비밀번호를 등록하면 이후 로그인 화면에서 이 연락처+비밀번호로 로그인할 수 있습니다.
        </p>
        <form className="mt-4 space-y-2" onSubmit={addAccount}>
          <input className="soft-input w-full text-sm" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} required />
          <input
            className="soft-input w-full text-sm"
            placeholder="연락처 (예: 010-1234-5678)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            required
          />
          <input
            className="soft-input w-full text-sm"
            placeholder="비밀번호 (4자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
          {message ? <p className="text-xs text-slate-700">{message}</p> : null}
          <button type="submit" disabled={loading} className="btn-primary w-full py-2 text-sm disabled:opacity-60">
            {loading ? "등록 중..." : "계정 추가"}
          </button>
        </form>
      </section>

      <section className="surface-card rounded-2xl border border-slate-200 p-5">
        <h2 className="text-lg font-black text-slate-950">관리자 계정 목록</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">연락처</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">마지막 로그인</th>
                <th className="px-3 py-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <EditRow
                  key={account.id}
                  account={account}
                  onUpdated={(updated) => setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))}
                />
              ))}
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                    등록된 관리자 계정이 없습니다. 위 폼에서 첫 계정을 추가하세요.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
