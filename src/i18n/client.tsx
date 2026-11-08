"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./config";
import type { Messages } from "./messages";
import { createFormatter } from "./format";
import { createGlobalTranslator, createTranslator, type Namespace } from "./translate";

type Ctx = { locale: Locale; messages: Messages };
const I18nContext = createContext<Ctx | null>(null);

/** Mounted once in the root layout with the messages for the active locale. */
export function I18nProvider({ locale, messages, children }: Ctx & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("I18nProvider is missing");
  return ctx;
}

/** Client Components: `const t = useT("opportunities"); t("title")`. */
export function useT<N extends Namespace>(namespace: N) {
  const { locale, messages } = useI18n();
  return useMemo(() => createTranslator(messages, locale, namespace), [messages, locale, namespace]);
}

export function useGlobalT() {
  const { locale, messages } = useI18n();
  return useMemo(() => createGlobalTranslator(messages, locale), [messages, locale]);
}

export function useLocale() {
  return useI18n().locale;
}

export function useFormatter() {
  const locale = useLocale();
  return useMemo(() => createFormatter(locale), [locale]);
}
