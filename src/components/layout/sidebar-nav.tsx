"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, type BadgeKey } from "./nav-config";
import { useT } from "@/i18n/client";

export function SidebarNav({ orgSlug, badges }: { orgSlug: string; badges: Partial<Record<BadgeKey, number>> }) {
  const t = useT("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("main")} className="grid gap-1">
      {NAV_ITEMS.map((item) => {
        const href = `/w/${orgSlug}/${item.href}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
        return (
          <Link
            key={item.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-2xl px-4 py-2.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              active && "bg-sidebar-accent text-foreground",
            )}
          >
            {active ? <span className="absolute top-1.5 bottom-1.5 -left-3 w-1 rounded-r-full bg-foreground lg:-left-5" aria-hidden /> : null}
            <item.icon className="size-[18px]" aria-hidden />
            <span>{t(item.key)}</span>
            {badge ? (
              <span className="ml-auto grid min-w-6 place-items-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background tabular-nums">
                <span className="sr-only">, </span>
                {badge > 99 ? "99+" : badge}
                <span className="sr-only">{" "}{item.badgeKey === "opportunities" ? t("badgeNew") : t("badgePending")}</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
