export default function BrandLockup() {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="우리집 전기주치의" className="h-9 w-auto shrink-0" />
      <div className="leading-tight">
        <p className="text-sm font-black text-white sm:text-base">우리집 전기주치의</p>
        <p className="text-[11px] font-bold text-cc-gold">(대경이엔피)</p>
      </div>
    </div>
  );
}
