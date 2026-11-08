"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocale, useT } from "@/i18n/client";
import { LOCALES, LOCALE_NAMES, INTL_LOCALE } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

export function LanguageSwitcher({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const t = useT("common");
  const current = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button variant="outline" size="icon" disabled={pending} aria-label={`${t("language.label")}: ${LOCALE_NAMES[current]}`}>
            <Languages className="size-[18px]" aria-hidden />
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={pending}>
            <Languages className="size-4" aria-hidden /> {LOCALE_NAMES[current]}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1.5">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("language.label")}</DropdownMenuLabel>
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            lang={INTL_LOCALE[l]}
            className="rounded-xl"
            onSelect={() =>
              start(async () => {
                await setLocale(l);
                router.refresh();
              })
            }
          >
            <span className="flex-1">{LOCALE_NAMES[l]}</span>
            {l === current ? <Check className="size-4" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
