import MobilePageTransition from "@/components/mobile/mobile-page-transition";

export default function ApartmentTemplate({ children }: { children: React.ReactNode }) {
  return <MobilePageTransition>{children}</MobilePageTransition>;
}
