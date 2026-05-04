import { notFound, redirect } from "next/navigation";
import { pgFindApartmentByCode, pgListApartments } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { MobileNavProvider } from "@/components/mobile/mobile-nav-provider";
import TenantPageHeader from "@/components/mobile/tenant-page-header";
import ReservationStatusBar from "@/components/reservation/reservation-status-bar";

export default async function ApartmentLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isSupabaseReservationsDbReady()) notFound();
  const apartment = await pgFindApartmentByCode(code);
  if (!apartment) {
    const apartments = await pgListApartments();
    if (apartments.length === 1) {
      redirect(`/apt/${apartments[0].code}`);
    }
    notFound();
  }
  const headerTitle =
    apartment.code === "hills3"
      ? "유니버시아드힐스테이트 3단지 입주민 전용"
      : `${apartment.name} 입주민 전용`;

  return (
    <MobileNavProvider>
      <div className="min-h-screen">
        <TenantPageHeader title={headerTitle} />
        {/* 헤더 바로 아래 (클라이언트 컴포넌트; 서버 layout에서 import 가능) */}
        <ReservationStatusBar aptCode={code} />
        <div className="mx-auto w-full max-w-3xl px-4 py-4">{children}</div>
      </div>
    </MobileNavProvider>
  );
}
