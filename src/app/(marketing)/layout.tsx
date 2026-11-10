import { MarketingShell } from "@/features/landing/components/marketing-shell";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return <MarketingShell>{children}</MarketingShell>;
}
