"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { INTL_LOCALE, LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";
const THEME_KEY = "mh-theme"; // same key the pre-paint script in the root layout reads

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

function Option({ selected, onSelect, icon: Icon, label, lang, disabled }: { selected: boolean; onSelect: () => void; icon?: LucideIcon; label: string; lang?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      lang={lang}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors",
        selected ? "border-foreground bg-foreground/[0.03] ring-1 ring-foreground" : "border-border hover:bg-muted/60",
      )}
    >
      {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden /> : null}
      <span className="flex-1">{label}</span>
      {selected ? <Check className="size-4" aria-hidden /> : null}
    </button>
  );
}

/** Personal preferences (per browser): interface language and color theme. */
export function PreferencesForm() {
  const t = useT("settings");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {}
    // Reading the browser's saved choice after mount; there's no server value to start from.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(stored === "dark" || stored === "system" ? stored : "light"); // light is the default
  }, []);

  const chooseLocale = (l: Locale) =>
    start(async () => {
      await setLocale(l);
      router.refresh();
      toast.success(t("preferences.saved"));
    });

  const themes: { key: Theme; icon: LucideIcon }[] = [
    { key: "light", icon: Sun },
    { key: "dark", icon: Moon },
    { key: "system", icon: Monitor },
  ];

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("preferences.language")}</h2>
          <p className="text-sm text-muted-foreground">{t("preferences.languageHint")}</p>
        </div>
        <div role="radiogroup" aria-label={t("preferences.language")} className="grid gap-2 sm:grid-cols-3">
          {LOCALES.map((l) => (
            <Option key={l} selected={l === locale} disabled={pending} onSelect={() => l !== locale && chooseLocale(l)} label={LOCALE_NAMES[l]} lang={INTL_LOCALE[l]} />
          ))}
        </div>
      </section>
      <section className="grid gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("preferences.theme")}</h2>
          <p className="text-sm text-muted-foreground">{t("preferences.themeHint")}</p>
        </div>
        <div role="radiogroup" aria-label={t("preferences.theme")} className="grid gap-2 sm:grid-cols-3">
          {themes.map(({ key, icon }) => (
            <Option
              key={key}
              icon={icon}
              selected={theme === key}
              onSelect={() => {
                setTheme(key);
                applyTheme(key);
              }}
              label={t(`preferences.themes.${key}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
