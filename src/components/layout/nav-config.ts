import { ArrowLeftRight, BriefcaseBusiness, HandCoins, Home, Settings, Sparkles, UserPlus, Users, type LucideIcon } from "lucide-react";

export type BadgeKey = "opportunities" | "referrals";

type NavKey = "home" | "opportunities" | "referrals" | "candidates" | "jobs" | "commissions" | "team" | "settings";

export type NavLink = { key: NavKey; href: string; icon: LucideIcon; badgeKey?: BadgeKey };

/**
 * One flat list, ordered by daily use: what to do now (Home), where to place my candidates
 * (Suggestions), referrals in both directions with the hiring pipeline (Referrals), then the
 * records themselves and the money. Each record lives on one page; detail pages link back to it.
 * Personal preferences live in the account menu.
 */
export const NAV_ITEMS: NavLink[] = [
  { key: "home", href: "overview", icon: Home },
  { key: "opportunities", href: "opportunities", icon: Sparkles, badgeKey: "opportunities" },
  // Received / Pipeline / Sent tabs on one page.
  { key: "referrals", href: "referrals", icon: ArrowLeftRight, badgeKey: "referrals" },
  { key: "candidates", href: "candidates", icon: Users },
  { key: "jobs", href: "jobs", icon: BriefcaseBusiness },
  { key: "commissions", href: "commissions", icon: HandCoins },
];

/** The "Agency" section: shown only to members who manage the organization (not plain recruiters). */
export const AGENCY_ITEMS: NavLink[] = [
  { key: "team", href: "settings/team", icon: UserPlus },
  // The longest matching link wins, so /settings/team highlights Team and /settings/privacy Settings.
  { key: "settings", href: "settings", icon: Settings },
];
