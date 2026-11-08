"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export function SettingsNav({ items }: { items: { href: string; label: string }[] }) {
  const t = useT("settings");
  const pathname = usePathname();
  return (
    <nav aria-label={t("nav.label")} className="flex flex-wrap gap-2">
      {items.map((i) => {
        const active = pathname === i.href;
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}
            className={cn("rounded-full border px-4 py-2 text-sm font-medium", active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-accent")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
