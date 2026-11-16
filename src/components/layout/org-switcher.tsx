"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { useT } from "@/i18n/client";

/** The current organization: switch between workspaces or create one. Team and settings live in the nav. */
export function OrgSwitcher({
  current,
  memberships,
}: {
  current: { slug: string; name: string; roleLabel: string; settlementMode?: boolean };
  memberships: { slug: string; name: string; isDemo: boolean; settlementMode?: boolean }[];
}) {
  const t = useT("common");
  const tn = useT("network");
  // N10 (BR-33): settlement-mode orgs stay listed with a neutral pill (text, not colour).
  const marker = <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 text-[10px] font-semibold text-foreground">{tn("settlement.marker")}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-left hover:bg-accent focus-visible:outline-2 data-[state=open]:bg-accent">
        <InitialsAvatar name={current.name} className="size-9 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{current.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{current.roleLabel}</span>
          {current.settlementMode ? <span className="mt-0.5 block">{marker}</span> : null}
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">{t("account.switch")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-60 rounded-2xl p-1.5">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("account.organizations")}</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem key={m.slug} asChild className="rounded-xl">
            <Link href={`/workspace/${m.slug}/overview`}>
              <InitialsAvatar name={m.name} className="size-6 rounded-lg text-[10px]" />
              <span className="flex-1 truncate">{m.name}</span>
              {m.settlementMode ? marker : null}
              {m.isDemo ? <span className="rounded-full bg-tile-yellow px-1.5 text-[10px] font-semibold text-tile-foreground">{t("account.demo")}</span> : null}
              {m.slug === current.slug ? <Check className="size-4" aria-label={t("account.current")} /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild className="rounded-xl">
          <Link href="/onboarding?new=1">
            <span className="grid size-6 place-items-center rounded-lg border border-dashed border-border" aria-hidden>
              <Plus className="size-3.5" />
            </span>
            {t("account.newOrganization")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
