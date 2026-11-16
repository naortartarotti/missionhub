import "server-only";
import type { UserClient } from "@/server/supabase/server";
import type { RequestContext } from "@/server/auth/context";
import { env } from "@/server/env";
import { getLocale, getT } from "@/i18n/server";
import { loaders } from "@/i18n/messages";
import { createFormatter } from "@/i18n/format";
import { createGlobalTranslator, createTranslator } from "@/i18n/translate";
import type { Locale } from "@/i18n/config";
import { defaultRulesLocale, isRulesLocale, type RulesLocale } from "./domain";
import type { RulesVersionSummary, RulesVersionText } from "./types";
import { RulesText, RulesToc } from "./components/rules-text";
import type { AcceptanceTexts } from "./components/acceptance-block";
import { cleanSupportEmail } from "./ui-state";

const uiLocaleForRules = (l: RulesLocale): Locale => (l === "fr-CA" ? "fr" : l === "pt-BR" ? "pt" : "en");

/**
 * Server-side data shaping for the N10 pages (frontend). Reads go through the user's client (RLS:
 * published versions only) or through ./queries; nothing here writes.
 */

/** Every locale of one published version (RLS hides drafts). */
export async function getRulesVersionTexts(db: UserClient, versionId: string): Promise<RulesVersionText[]> {
  const { data, error } = await db.from("network_rules_version_texts").select("locale, body, change_summary, sha256, rules, sections").eq("version_id", versionId);
  if (error) throw error;
  return ((data ?? []) as unknown as RulesVersionText[]).filter((r) => isRulesLocale(r.locale));
}

export async function getRulesVersionById(db: UserClient, versionId: string): Promise<RulesVersionSummary | null> {
  const { data, error } = await db.from("network_rules_versions").select("id, label, type, effective_on, effective_at, published_at, legal_reason").eq("id", versionId).maybeSingle();
  if (error) throw error;
  return (data as RulesVersionSummary | null) ?? null;
}

/** The acceptance block's texts, rendered on the server (RulesText + TOC per locale). */
export async function buildAcceptanceTexts(db: UserClient, versionId: string): Promise<AcceptanceTexts> {
  const [rows, t] = await Promise.all([getRulesVersionTexts(db, versionId), getT("network")]);
  return Object.fromEntries(
    rows.map((r) => [
      r.locale,
      {
        text: <RulesText body={r.body} locale={r.locale} />,
        toc: <RulesToc sections={r.sections ?? []} locale={r.locale} label={t("accept.contents")} />,
        changeSummary: r.change_summary,
      },
    ]),
  ) as AcceptanceTexts;
}

export async function defaultLocaleFor(ctx: Pick<RequestContext, "quebec"> | null, override?: string | null): Promise<RulesLocale> {
  return defaultRulesLocale({ quebec: ctx?.quebec ?? false, uiLocale: await getLocale(), override });
}

export const supportEmail = () => cleanSupportEmail(env.SUPPORT_EMAIL ?? null);

/** Change summaries of every published version in one locale (versions page history, admin list). */
export async function getChangeSummaries(db: UserClient, locale: RulesLocale): Promise<Map<string, string | null>> {
  const { data, error } = await db.from("network_rules_version_texts").select("version_id, change_summary").eq("locale", locale);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.version_id as string, (r.change_summary as string | null) ?? null]));
}

/** The caller's own personal acceptances (RLS: own rows), newest first. */
export async function getMyAcceptances(db: UserClient, userId: string): Promise<{ version_id: string; accepted_at: string }[]> {
  const { data, error } = await db.from("network_rules_member_acceptances").select("version_id, accepted_at").eq("user_id", userId).order("accepted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as { version_id: string; accepted_at: string }[];
}

/**
 * Translators and formatter in a notice's language (§5.0): `network.notice.*`, `network.decision.*`,
 * `network.incident.intro/guidance*` and the review outcome lines render in the language the admin
 * chose, not the viewer's UI language.
 */
export async function getNoticeI18n(language: RulesLocale) {
  const locale = uiLocaleForRules(language);
  const messages = await loaders[locale]();
  return { t: createTranslator(messages, locale, "network"), tg: createGlobalTranslator(messages, locale), f: createFormatter(locale), locale };
}

const TEMPLATE_KEYS = [
  "notice.heading", "notice.headingImmediate", "notice.intro", "notice.introImmediate", "notice.holdEffects", "notice.rules",
  "notice.ruleItem", "notice.version", "notice.alleged", "notice.when", "notice.evidence", "notice.reportedBy", "notice.deadline",
  "notice.howToRespond", "notice.possibleOutcomes", "incident.guidance", "incident.guidanceHiring",
] as const;

/** Raw template strings (placeholders kept) in each notice language, for the admin composer preview. */
export async function getNoticeTemplates(): Promise<Record<RulesLocale, Record<string, string>>> {
  const entries = await Promise.all(
    (["en", "fr-CA", "pt-BR"] as const).map(async (l) => {
      const { t } = await getNoticeI18n(l);
      return [l, Object.fromEntries(TEMPLATE_KEYS.map((k) => [k.split(".")[1], t(k)]))] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<RulesLocale, Record<string, string>>;
}
