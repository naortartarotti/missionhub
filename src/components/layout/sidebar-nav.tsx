"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isGroup, type BadgeKey, type NavLink } from "./nav-config";
import { useT } from "@/i18n/client";
import { useNavHint } from "./nav-hint";

type Badges = Partial<Record<BadgeKey, number>>;

const itemClass = "relative flex items-center gap-3 rounded-2xl px-4 py-2.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground";

export function SidebarNav({ orgSlug, badges }: { orgSlug: string; badges: Badges }) {
  const t = useT("nav");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hintedTab = useNavHint(pathname);

  const isActive = (link: NavLink) => {
    const href = `/w/${orgSlug}/${link.href}`;
    if (pathname !== href && !pathname.startsWith(`${href}/`)) return false;
    if (!link.tab) return true;
    // Detail pages (e.g. /referrals/<id>) can't be told apart by URL: the page hints its tab (see NavHint).
    // Without a hint, highlight neither rather than both.
    if (pathname !== href) return hintedTab === link.tab;
    // Referrals opens on Received when something is waiting (see referrals/page.tsx), else Sent.
    const tab = searchParams.get("tab") ?? (badges.referrals ? "received" : "sent");
    return tab === link.tab;
  };

  return (
    <nav aria-label={t("main")} className="grid gap-1">
      {NAV_ITEMS.map((item) =>
        isGroup(item) ? (
          <NavCategory key={item.key} label={t(item.key)} icon={item.icon} active={item.children.some(isActive)}>
            {item.children.map((child) => (
              <NavItemLink key={child.key} orgSlug={orgSlug} link={child} label={t(child.key)} active={isActive(child)} badges={badges} nested />
            ))}
          </NavCategory>
        ) : (
          <NavItemLink key={item.key} orgSlug={orgSlug} link={item} label={t(item.key)} active={isActive(item)} badges={badges} />
        ),
      )}
    </nav>
  );
}

function NavCategory({ label, icon: Icon, active, children }: { label: string; icon: LucideIcon; active: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(itemClass, "w-full text-left", active && "text-foreground")}
      >
        <Icon className="size-[18px]" aria-hidden />
        <span className="flex-1">{label}</span>
        <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} aria-hidden />
      </button>
      {open ? <div className="grid gap-1">{children}</div> : null}
    </div>
  );
}

function NavItemLink({ orgSlug, link, label, active, badges, nested = false }: { orgSlug: string; link: NavLink; label: string; active: boolean; badges: Badges; nested?: boolean }) {
  const t = useT("nav");
  const badge = link.badgeKey ? badges[link.badgeKey] : undefined;
  const Icon = link.icon;
  return (
    <Link
      href={`/w/${orgSlug}/${link.href}${link.tab ? `?tab=${link.tab}` : ""}`}
      aria-current={active ? "page" : undefined}
      className={cn(itemClass, nested && "py-2 pl-[46px] text-sm", active && "bg-sidebar-accent text-foreground")}
    >
      {active ? <span className="absolute top-1.5 bottom-1.5 -left-3 w-1 rounded-r-full bg-foreground lg:-left-5" aria-hidden /> : null}
      {Icon ? <Icon className="size-[18px]" aria-hidden /> : null}
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
