import type { RulesLocale } from "./domain";

/** BCP 47 tag for the `lang` attribute around a rules text. */
export const INTL_RULES_LANG: Record<RulesLocale, string> = { en: "en-CA", "fr-CA": "fr-CA", "pt-BR": "pt-BR" };

/** i18n key suffix for a rules locale (`network.accept.languageOption.frCA` …). */
export const RULES_LOCALE_KEY = { en: "en", "fr-CA": "frCA", "pt-BR": "ptBR" } as const satisfies Record<RulesLocale, string>;

/** The switch order: Français first when the default is fr-CA (§2.5 item 2). */
export function rulesLocaleOrder(defaultLocale: RulesLocale): RulesLocale[] {
  return defaultLocale === "fr-CA" ? ["fr-CA", "en", "pt-BR"] : ["en", "fr-CA", "pt-BR"];
}
