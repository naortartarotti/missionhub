import { BriefcaseBusiness, LayoutGrid, Users, Wallet, type LucideIcon } from "lucide-react";

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
  | "pipeline"
  | "wallet";

/** A page link. `tab` targets `?tab=` on the page (Referrals has Sent / Received tabs). */
export type NavLink = { key: NavKey; href: string; tab?: string; icon?: LucideIcon; badgeKey?: BadgeKey };
/** A category: a header with its pages underneath. */
export type NavGroup = { key: NavKey; icon: LucideIcon; children: NavLink[] };
export type NavItem = NavLink | NavGroup;

export const isGroup = (item: NavItem): item is NavGroup => "children" in item;

/**
 * Organized by the two roles a recruiter plays:
 * - My candidates: my pool → partner jobs that fit them → referrals I sent.
 * - My jobs: jobs I posted → referrals partners sent me → the pipeline of the ones I accepted.
 * Each record lives on one page only; detail pages link back to it.
 * Settings aren't here: organization settings open from the org switcher, personal preferences
 * from the account menu.
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
      // Accepted referrals, stage by stage until the hire.
      { key: "pipeline", href: "pipeline" },
    ],
  },
  // Balances, commissions per placement, withdrawals and the statement live on one page.
  { key: "wallet", href: "wallet", icon: Wallet },
];
