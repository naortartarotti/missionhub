"use client";

import { useId } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AGENCY_ITEMS, NAV_ITEMS, type BadgeKey, type NavLink } from "./nav-config";
import { useT } from "@/i18n/client";

type Badges = Partial<Record<BadgeKey, number>>;

const itemClass = "relative flex items-center gap-3 rounded-2xl px-4 py-2.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground";

// N10 settlement mode (BR-34): only in-flight work stays; candidates, jobs and opportunities are paused.
const SETTLEMENT_HIDDEN = new Set(["opportunities", "candidates", "jobs"]);

export function SidebarNav({ orgSlug, badges, showAgency, settlement = false }: { orgSlug: string; badges: Badges; showAgency: boolean; settlement?: boolean }) {
  const t = useT("nav");
  const pathname = usePathname();
  // The sidebar renders twice (desktop aside and mobile sheet), so the heading id must be unique.
  const agencyId = useId();
  const hrefOf = (link: NavLink) => `/workspace/${orgSlug}/${link.href}`;
  // The longest matching link wins (e.g. /settings/team → Team, /settings/privacy → Settings).
  const navItems = settlement ? NAV_ITEMS.filter((i) => !SETTLEMENT_HIDDEN.has(i.key)) : NAV_ITEMS;
  const links = showAgency ? [...navItems, ...AGENCY_ITEMS] : navItems;
  const active = links
    .filter((l) => pathname === hrefOf(l) || pathname.startsWith(`${hrefOf(l)}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.key;

  return (
    <nav aria-label={t("main")} className="grid gap-1">
      {navItems.map((item) => (
        <NavItemLink key={item.key} href={hrefOf(item)} link={item} label={t(item.key)} active={active === item.key} badges={badges} />
      ))}
      {showAgency ? (
        <div className="mt-6 grid gap-1" role="group" aria-labelledby={agencyId}>
          <p id={agencyId} className="px-4 pb-1 text-xs font-medium text-muted-foreground">
            {t("agency")}
          </p>
          {AGENCY_ITEMS.map((item) => (
            <NavItemLink key={item.key} href={hrefOf(item)} link={item} label={t(item.key)} active={active === item.key} badges={badges} />
          ))}
        </div>
      ) : null}
    </nav>
  );
}

function NavItemLink({ href, link, label, active, badges }: { href: string; link: NavLink; label: string; active: boolean; badges: Badges }) {
  const t = useT("nav");
  const badge = link.badgeKey ? badges[link.badgeKey] : undefined;
  const Icon = link.icon;
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn(itemClass, active && "bg-sidebar-accent text-foreground")}>
      {active ? <span className="absolute top-1.5 bottom-1.5 -left-3 w-1 rounded-r-full bg-foreground lg:-left-5" aria-hidden /> : null}
      <Icon className="size-[18px]" aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
      {badge ? (
        <span className="ml-auto grid min-w-6 place-items-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background tabular-nums">
          <span className="sr-only">, </span>
          {badge > 99 ? "99+" : badge}
          <span className="sr-only">{" "}{link.badgeKey === "opportunities" ? t("badgeNew") : t("badgePending")}</span>
        </span>
      ) : null}
    </Link>
  );
}
