import { LayoutGrid, Sparkles, Users, BriefcaseBusiness, ArrowLeftRight, Wallet, Bell, Settings, type LucideIcon } from "lucide-react";

export type NavItem = { key: string; label: string; href: string; icon: LucideIcon; badgeKey?: "referrals" | "notifications" };

export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", href: "overview", icon: LayoutGrid },
  { key: "opportunities", label: "Opportunities", href: "opportunities", icon: Sparkles },
  { key: "candidates", label: "Candidates", href: "candidates", icon: Users },
  { key: "jobs", label: "Jobs", href: "jobs", icon: BriefcaseBusiness },
  { key: "referrals", label: "Referrals", href: "referrals", icon: ArrowLeftRight, badgeKey: "referrals" },
  { key: "commissions", label: "Commissions", href: "commissions", icon: Wallet },
  { key: "notifications", label: "Activity", href: "notifications", icon: Bell, badgeKey: "notifications" },
  { key: "settings", label: "Settings", href: "settings", icon: Settings },
];
