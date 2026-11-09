import { BriefcaseBusiness, LayoutGrid, Users, Wallet, Settings, type LucideIcon } from "lucide-react";

export type BadgeKey = "opportunities" | "referrals";

type NavKey =
  | "overview"
  | "myCandidates"
  | "candidates"
  | "opportunities"
  | "referralsSent"
  | "myJobs"
  | "jobs"
  | "referralsReceived"
  | "commissions"
  | "settings";

/** A page link. `tab` targets `?tab=` on the page (Referrals has Sent / Received tabs). */
export type NavLink = { key: NavKey; href: string; tab?: string; icon?: LucideIcon; badgeKey?: BadgeKey };
/** A category: a header with its pages underneath. */
export type NavGroup = { key: NavKey; icon: LucideIcon; children: NavLink[] };
export type NavItem = NavLink | NavGroup;

export const isGroup = (item: NavItem): item is NavGroup => "children" in item;

/**
 * Organized by the two roles a recruiter plays:
 * - My candidates: my pool → partner jobs that fit them → referrals I sent.
 * - My jobs: jobs I posted → referrals partners sent me.
 * Each record lives on one page only; detail pages link back to it.
 */
export const NAV_ITEMS: NavItem[] = [
  { key: "overview", href: "overview", icon: LayoutGrid },
  {
    key: "myCandidates",
    icon: Users,
    children: [
      { key: "candidates", href: "candidates" },
      { key: "opportunities", href: "opportunities", badgeKey: "opportunities" },
      { key: "referralsSent", href: "referrals", tab: "sent" },
    ],
  },
  {
    key: "myJobs",
    icon: BriefcaseBusiness,
    children: [
      { key: "jobs", href: "jobs" },
      { key: "referralsReceived", href: "referrals", tab: "received", badgeKey: "referrals" },
    ],
  },
  { key: "commissions", href: "commissions", icon: Wallet },
  { key: "settings", href: "settings", icon: Settings },
];
