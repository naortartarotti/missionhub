"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Building2, FileCheck2, LayoutGrid, Percent, ScrollText, Users, Wallet, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type BadgeKey = "evidence" | "disputes" | "wallets";
type ItemKey = "overview" | "organizations" | "users" | "evidence" | "disputes" | "wallets" | "rules" | "audit";
type Item = { key: ItemKey; href: string; icon: LucideIcon; badge?: BadgeKey };

const GROUPS: { key: "operations" | "finance" | "compliance"; items: Item[] }[] = [
  {
    key: "operations",
    items: [
      { key: "overview", href: "/admin", icon: LayoutGrid },
      { key: "organizations", href: "/admin/organizations", icon: Building2 },
      { key: "users", href: "/admin/users", icon: Users },
    ],
  },
  {
    key: "finance",
    items: [
      { key: "evidence", href: "/admin/evidence", icon: FileCheck2, badge: "evidence" },
      { key: "disputes", href: "/admin/disputes", icon: AlertTriangle, badge: "disputes" },
      { key: "wallets", href: "/admin/wallets", icon: Wallet, badge: "wallets" },
      { key: "rules", href: "/admin/rules", icon: Percent },
    ],
  },
  { key: "compliance", items: [{ key: "audit", href: "/admin/audit", icon: ScrollText }] },
];

export function AdminSidebarNav({ badges }: { badges: Record<BadgeKey, number> }) {
  const t = useT("admin");
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label={t("nav.label")} className="grid gap-6">
      {GROUPS.map((g) => (
        <div key={g.key} className="grid gap-1">
          <p className="px-4 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t(`nav.${g.key}`)}</p>
          {g.items.map((item) => {
            const active = isActive(item.href);
            const count = item.badge ? badges[item.badge] : 0;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-2xl px-4 py-2.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                  active && "bg-sidebar-accent text-foreground",
                )}
              >
                {active ? <span className="absolute top-1.5 bottom-1.5 -left-3 w-1 rounded-r-full bg-foreground lg:-left-5" aria-hidden /> : null}
                <item.icon className="size-[18px]" aria-hidden />
                <span className="min-w-0 truncate">{t(`nav.${item.key}`)}</span>
                {count ? (
                  <span className="ml-auto grid min-w-6 place-items-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background tabular-nums">
                    {count > 99 ? "99+" : count}
                    <span className="sr-only"> {t("nav.pending")}</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
