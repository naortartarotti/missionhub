import { LayoutGrid, Sparkles, Users, BriefcaseBusiness, ArrowLeftRight, Wallet, Settings, type LucideIcon } from "lucide-react";

export type BadgeKey = "opportunities" | "referrals";

export type NavItem = { key: "overview" | "opportunities" | "candidates" | "jobs" | "referrals" | "commissions" | "settings"; href: string; icon: LucideIcon; badgeKey?: BadgeKey };

export const NAV_ITEMS: NavItem[] = [
  { key: "overview", href: "overview", icon: LayoutGrid },
  { key: "opportunities", href: "opportunities", icon: Sparkles, badgeKey: "opportunities" },
  { key: "candidates", href: "candidates", icon: Users },
  { key: "jobs", href: "jobs", icon: BriefcaseBusiness },
  { key: "referrals", href: "referrals", icon: ArrowLeftRight, badgeKey: "referrals" },
  { key: "commissions", href: "commissions", icon: Wallet },
  { key: "settings", href: "settings", icon: Settings },
];
