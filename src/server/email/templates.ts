import "server-only";

import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { createFormatter } from "@/i18n/format";
import { loaders } from "@/i18n/messages";
import { createTranslator } from "@/i18n/translate";
import { renderEmail, type EmailContent } from "./layout";

/**
 * Every email MissionHub sends, rendered in an explicit locale (emails are often built outside a
 * request from the recipient, e.g. in the Supabase auth hook, so the cookie locale doesn't apply).
 * Copy lives in `src/i18n/messages/<locale>/emails.json`.
 */
export type RenderedEmail = { subject: string; html: string; text: string };

export const toLocale = (v: unknown): Locale => (isLocale(v) ? v : DEFAULT_LOCALE);

async function translator(locale: Locale) {
  const messages = await loaders[locale]();
  const t = createTranslator(messages, locale, "emails");
  // Keys are composed from the template name; the JSON shape is checked by the i18n tests.
  const k = (key: string, vars?: Record<string, string | number>) => t(key as Parameters<typeof t>[0], vars);
  return { k, f: createFormatter(locale) };
}

function build(k: Awaited<ReturnType<typeof translator>>["k"], subject: string, content: Omit<EmailContent, "chrome">): RenderedEmail {
  return { subject, ...renderEmail({ ...content, chrome: { linkFallback: k("chrome.linkFallback"), footer: k("chrome.footer") } }) };
}

// ---------------------------------------------------------------------------------------------
// Account (Supabase Auth, delivered through the Send Email Hook)

export type AuthEmailKind =
  | "signup"
  | "recovery"
  | "magiclink"
  | "invite"
  | "emailChangeCurrent"
  | "emailChangeNew"
  | "reauthentication"
  | "passwordChanged"
  | "emailChanged"
  | "securityNotice";

/** Templates that carry a call-to-action link. */
const WITH_LINK = new Set<AuthEmailKind>(["signup", "recovery", "magiclink", "invite", "emailChangeCurrent", "emailChangeNew", "passwordChanged"]);

export async function authEmail(
  kind: AuthEmailKind,
  locale: Locale,
  v: { name?: string | null; email: string; newEmail?: string; oldEmail?: string; url?: string; code?: string; event?: string },
): Promise<RenderedEmail> {
  const { k } = await translator(locale);
  const vars = { email: v.email, newEmail: v.newEmail ?? "", oldEmail: v.oldEmail ?? "", code: v.code ?? "", event: v.event ?? "" };
  const greeting = v.name ? k("chrome.hello", { name: v.name.split(" ")[0] }) : k("chrome.helloAnonymous");
  return build(k, k(`${kind}.subject`, vars), {
    preheader: k(`${kind}.preheader`, vars),
    heading: k(`${kind}.heading`, vars),
    paragraphs: [greeting, k(`${kind}.body`, vars)],
    code: kind === "reauthentication" && v.code ? { label: k("reauthentication.codeLabel"), value: v.code } : undefined,
    cta: WITH_LINK.has(kind) && v.url ? { label: k(`${kind}.cta`), url: v.url } : undefined,
    note: k(`${kind}.note`, vars),
  });
}

// ---------------------------------------------------------------------------------------------
// Product emails

export async function teamInviteEmail(locale: Locale, v: { inviter: string; org: string; role: string; email: string; url: string }): Promise<RenderedEmail> {
  const { k } = await translator(locale);
  return build(k, k("teamInvite.subject", v), {
    preheader: k("teamInvite.preheader", v),
    heading: k("teamInvite.heading", v),
    paragraphs: [k("teamInvite.body", v)],
    details: [
      { label: k("teamInvite.org"), value: v.org },
      { label: k("teamInvite.role"), value: v.role },
      { label: k("teamInvite.invitedBy"), value: v.inviter },
    ],
    cta: { label: k("teamInvite.cta"), url: v.url },
    note: k("teamInvite.note"),
  });
}

export async function candidateRequestEmail(
  locale: Locale,
  v: { name?: string | null; recruiter: string; org: string; partner: string; job: string; expiresAt: Date; url: string },
): Promise<RenderedEmail> {
  const { k, f } = await translator(locale);
  const vars = { recruiter: v.recruiter, org: v.org, partner: v.partner, job: v.job };
  return build(k, k("candidateRequest.subject", vars), {
    preheader: k("candidateRequest.preheader"),
    heading: k("candidateRequest.heading", vars),
    paragraphs: [
      v.name ? k("chrome.hello", { name: v.name.split(" ")[0] }) : k("chrome.helloAnonymous"),
      k("candidateRequest.body", vars),
      k("candidateRequest.body2"),
    ],
    details: [
      { label: k("candidateRequest.job"), value: v.job },
      { label: k("candidateRequest.partner"), value: v.partner },
      { label: k("candidateRequest.recruiter"), value: `${v.recruiter} · ${v.org}` },
      { label: k("candidateRequest.expires"), value: f.date(v.expiresAt.toISOString()) },
    ],
    cta: { label: k("candidateRequest.cta"), url: v.url },
    note: k("candidateRequest.note"),
  });
}
