"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus, LogOut, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { signOut } from "@/features/auth/actions";
import { useT } from "@/i18n/client";

export function OrgSwitcher({
  current,
  memberships,
  user,
}: {
  current: { slug: string; name: string; roleLabel: string };
  memberships: { slug: string; name: string; isDemo: boolean }[];
  user: { fullName: string; email: string; isPlatformAdmin: boolean };
}) {
  const t = useT("common");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-left hover:bg-accent focus-visible:outline-2">
        <InitialsAvatar name={current.name} className="size-9 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{current.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{current.roleLabel}</span>
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">{t("account.switch")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64 rounded-2xl p-1.5">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("account.organizations")}</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem key={m.slug} asChild className="rounded-xl">
            <Link href={`/w/${m.slug}/overview`}>
              <span className="flex-1 truncate">{m.name}</span>
              {m.isDemo ? <span className="rounded-full bg-tile-yellow px-1.5 text-[10px] font-semibold text-tile-foreground">{t("account.demo")}</span> : null}
              {m.slug === current.slug ? <Check className="size-4" aria-label={t("account.current")} /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild className="rounded-xl">
          <Link href="/onboarding?new=1">
            <Plus className="size-4" aria-hidden /> {t("account.newOrganization")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{user.fullName || t("account.yourAccount")}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        {user.isPlatformAdmin ? (
          <DropdownMenuItem asChild className="rounded-xl">
            <Link href="/admin">
              <ShieldCheck className="size-4" aria-hidden /> {t("account.platformAdmin")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="rounded-xl" onSelect={() => void signOut()}>
          <LogOut className="size-4" aria-hidden /> {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
