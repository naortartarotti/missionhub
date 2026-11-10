"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Check, EllipsisVertical, Languages, LogOut, Monitor, Moon, ShieldCheck, Sun, UserRound, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { signOut } from "@/features/auth/actions";
import { useLocale, useT } from "@/i18n/client";
import { INTL_LOCALE, LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";
import { applyTheme, readTheme, THEMES, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const THEME_ICONS: Record<Theme, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };

/** The signed-in person: profile, language and theme (per browser), platform admin and sign out. */
export function AccountMenu({ orgSlug, user }: { orgSlug: string; user: { fullName: string; email: string; isPlatformAdmin: boolean } }) {
  const t = useT("common");
  const ts = useT("settings");
  const tp = useT("profile");
  const [theme, setTheme] = useState<Theme>("light");
  const name = user.fullName || t("account.yourAccount");
  const locale = useLocale();
  const router = useRouter();
  const [localePending, startLocale] = useTransition();

  const chooseLocale = (l: Locale) => {
    if (l === locale) return;
    startLocale(async () => {
      await setLocale(l);
      router.refresh();
      toast.success(ts("preferences.saved"));
    });
  };

  useEffect(() => {
    // The saved theme lives in this browser only, so it can only be read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readTheme());
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-sidebar-accent focus-visible:outline-2 data-[state=open]:bg-sidebar-accent">
        <InitialsAvatar name={user.fullName || user.email} className="size-9" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
        <EllipsisVertical className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">{t("account.menu")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64 rounded-2xl p-1.5">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="rounded-xl">
          <Link href={`/w/${orgSlug}/profile`}>
            <UserRound className="size-4" aria-hidden /> {tp("menu")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="rounded-xl" disabled={localePending}>
            <Languages className="size-4" aria-hidden />
            <span className="flex-1">{ts("preferences.language")}</span>
            <span className="text-xs text-muted-foreground">{LOCALE_NAMES[locale]}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40 rounded-2xl p-1.5">
            {LOCALES.map((l) => (
              <DropdownMenuItem key={l} lang={INTL_LOCALE[l]} className="rounded-xl" onSelect={() => chooseLocale(l)}>
                <span className="flex-1">{LOCALE_NAMES[l]}</span>
                {l === locale ? <Check className="size-4" aria-hidden /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-sm">{ts("preferences.theme")}</span>
          <DropdownMenuPrimitive.RadioGroup
            value={theme}
            onValueChange={(v) => {
              setTheme(v as Theme);
              applyTheme(v as Theme);
            }}
            aria-label={ts("preferences.theme")}
            className="flex rounded-full bg-muted p-0.5"
          >
            {THEMES.map((key) => {
              const Icon = THEME_ICONS[key];
              return (
                <DropdownMenuPrimitive.RadioItem
                  key={key}
                  value={key}
                  // Keep the menu open so the change is visible right away.
                  onSelect={(e) => e.preventDefault()}
                  title={ts(`preferences.themes.${key}`)}
                  aria-label={ts(`preferences.themes.${key}`)}
                  className={cn(
                    "grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-ring data-[highlighted]:text-foreground",
                    "data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-sm",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                </DropdownMenuPrimitive.RadioItem>
              );
            })}
          </DropdownMenuPrimitive.RadioGroup>
        </div>
        {user.isPlatformAdmin ? (
          <DropdownMenuItem asChild className="rounded-xl">
            <Link href="/admin">
              <ShieldCheck className="size-4" aria-hidden /> {t("account.platformAdmin")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="rounded-xl" onSelect={() => void signOut()}>
          <LogOut className="size-4" aria-hidden /> {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
