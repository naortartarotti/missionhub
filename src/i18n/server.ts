import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchAcceptLanguage, type Locale } from "./config";
import { loaders } from "./messages";
import { createFormatter } from "./format";
import { createGlobalTranslator, createTranslator, type Namespace } from "./translate";

/** Resolution order: the user's chosen language (cookie) → browser language → English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return matchAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
});

export const getMessages = cache(async () => loaders[await getLocale()]());

/** Server Components / actions: `const t = await getT("overview"); t("title")`. */
export async function getT<N extends Namespace>(namespace: N) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return createTranslator(messages, locale, namespace);
}

/** Translator over the whole tree, for keys from several namespaces (`t("labels.band.strong")`). */
export async function getGlobalT() {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return createGlobalTranslator(messages, locale);
}

export async function getFormatter() {
  return createFormatter(await getLocale());
}
