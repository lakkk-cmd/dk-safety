"use client";

type BankInfo = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

type Props = {
  apartmentName: string;
  bankInfo?: BankInfo;
  /** 접수 시 입력한 동·호 — 가상계좌 발급 전에도 예금주 표기에 사용 */
  depositHolderLabel?: string;
  /** 실제 청구 금액(예: 기본 출장비) — 가상계좌 발급 전 표시할 금액. 발급 후에는 virtualAccount.amount 우선 */
  expectedAmount: number;
  virtualAccount?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    dueAt: string | null;
    amount: number;
  } | null;
  disabled?: boolean;
  loading?: boolean;
  onMarkDepositDone: () => void;
};

function tossTransferDeepLink(bankInfo: BankInfo | undefined, amount: number) {
  const bank = encodeURIComponent(bankInfo?.bankName ?? "");
  const accountNo = encodeURIComponent((bankInfo?.accountNumber ?? "").replaceAll("-", ""));
  const receiver = encodeURIComponent(bankInfo?.accountHolder ?? "");
  const money = String(amount);
  return `supertoss://send?bank=${bank}&accountNo=${accountNo}&amount=${money}&receiver=${receiver}`;
}

function tossTransferFallback(bankInfo: BankInfo | undefined, amount: number) {
  const bank = encodeURIComponent(bankInfo?.bankName ?? "");
  const accountNo = encodeURIComponent((bankInfo?.accountNumber ?? "").replaceAll("-", ""));
  const receiver = encodeURIComponent(bankInfo?.accountHolder ?? "");
  const money = String(amount);
  return `https://toss.im/_m/send?bank=${bank}&accountNo=${accountNo}&amount=${money}&receiver=${receiver}`;
}

export default function DepositPaymentPanel({
  apartmentName,
  bankInfo,
  depositHolderLabel,
  expectedAmount,
  virtualAccount = null,
  disabled = false,
  loading = false,
  onMarkDepositDone
}: Props) {
  const activeBank = virtualAccount?.bankName || bankInfo?.bankName || "기업은행";
  const activeAccount = virtualAccount?.accountNumber
    ? virtualAccount.accountNumber.replaceAll(/[^0-9]/g, "")
    : bankInfo?.accountNumber
      ? bankInfo.accountNumber.replaceAll(/[^0-9]/g, "")
      : "계좌번호 발급 전";
  const trimmedUnit = depositHolderLabel?.trim();
  const activeHolder =
    virtualAccount?.accountHolder || (trimmedUnit ? trimmedUnit : undefined) || bankInfo?.accountHolder || apartmentName;
  const activeAmount = virtualAccount?.amount || expectedAmount;
  const deepLink = tossTransferDeepLink(
    { bankName: activeBank, accountNumber: activeAccount, accountHolder: activeHolder },
    activeAmount
  );
  const fallbackLink = tossTransferFallback(
    { bankName: activeBank, accountNumber: activeAccount, accountHolder: activeHolder },
    activeAmount
  );

  return (
    <div className="deposit-payment-panel mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[15px] leading-normal text-slate-900 antialiased">
      <p className="text-xs font-bold leading-snug text-amber-800">가상계좌</p>
      <p className="mt-1 text-lg font-bold leading-snug tracking-tight">{activeBank}</p>
      <p className="mt-1 text-2xl font-black leading-tight tracking-tight text-dk-navy">{activeAccount}</p>
      <p className="mt-1 text-sm font-medium leading-snug text-slate-700">예금주: {activeHolder}</p>
      <p className="mt-1 text-sm font-medium leading-snug text-slate-700">입금금액: {activeAmount.toLocaleString("ko-KR")}원</p>
      <p className="mt-1 text-xs font-medium leading-snug text-amber-900">
        입금기한: {virtualAccount?.dueAt ? new Date(virtualAccount.dueAt).toLocaleString("ko-KR") : "발급 후 안내"}
      </p>
      <div className="mt-3 grid gap-2">
        <a href={deepLink} className="inline-flex h-12 items-center justify-center rounded-xl bg-dk-navy text-sm font-bold leading-snug text-white">
          Toss 송금으로 바로 입금하기
        </a>
        <a
          href={fallbackLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-xs font-semibold leading-snug text-slate-700"
        >
          앱 실행이 안 되면 Toss 웹 링크 열기
        </a>
      </div>
      <button
        type="button"
        onClick={onMarkDepositDone}
        disabled={disabled || loading}
        className="mt-3 h-12 w-full rounded-xl bg-emerald-600 text-sm font-bold leading-snug text-white disabled:opacity-50"
      >
        입금 완료 (자동확인 안 될 때)
      </button>
      <p className="deposit-payment-panel-footnote mt-2.5 [word-break:keep-all]">
        입금 완료 후 자동 결제 완료가 되지 않을 경우 입금 완료 버튼을 눌러주세요
      </p>
    </div>
  );
}
