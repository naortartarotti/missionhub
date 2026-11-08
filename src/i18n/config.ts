export const LOCALES = ["en", "fr", "pt"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
/** Cookie holding the user's chosen language. Read on the server, written by `setLocale`. */
export const LOCALE_COOKIE = "mh-locale";

/** Each language's own name, shown in the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", fr: "Français", pt: "Português" };

/** BCP 47 tag used for Intl formatting (dates, numbers, currency) and <html lang>. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-CA", fr: "fr-CA", pt: "pt-BR" };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** Picks the best supported locale from an Accept-Language header ("fr-CA,fr;q=0.9,en;q=0.8"). */
export function matchAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .filter((x) => x.lang && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  return ranked.map((x) => x.lang).find(isLocale);
}
