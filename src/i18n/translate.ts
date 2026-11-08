import { INTL_LOCALE, type Locale } from "./config";
import type { Messages } from "./messages";

/**
 * A message is a string with optional `{name}` placeholders, or a plural set
 * `{ "one": "{count} match", "other": "{count} matches" }` (optionally "zero"), chosen with
 * Intl.PluralRules from `vars.count`.
 */
type Plural = { one: string; other: string; zero?: string };
export type Vars = Record<string, string | number>;

type Join<K extends string, P extends string> = `${K}.${P}`;
/** All dotted key paths of a message tree whose leaves are strings or plural sets. */
export type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : T[K] extends Plural ? K : Join<K, Paths<T[K]>>;
}[keyof T & string];

export type Namespace = keyof Messages;
export type Translator<N extends Namespace> = (key: Paths<Messages[N]>, vars?: Vars) => string;
export type GlobalTranslator = (key: Paths<Messages>, vars?: Vars) => string;

function lookup(tree: unknown, path: string): unknown {
  let node = tree;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return node;
}

function format(template: string, vars: Vars | undefined, locale: Locale): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    if (v === undefined) return match;
    return typeof v === "number" ? new Intl.NumberFormat(INTL_LOCALE[locale]).format(v) : v;
  });
}

function resolve(messages: Messages, locale: Locale, fullKey: string, vars?: Vars): string {
  const node = lookup(messages, fullKey);
  if (typeof node === "string") return format(node, vars, locale);
  if (node && typeof node === "object" && "other" in node) {
    const p = node as Plural;
    const count = Number(vars?.count ?? 0);
    const rule = new Intl.PluralRules(INTL_LOCALE[locale]).select(count);
    const template = count === 0 && p.zero ? p.zero : rule === "one" ? p.one : p.other;
    return format(template, vars, locale);
  }
  // Missing key: show the key itself so it's obvious in the UI and easy to grep.
  if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing "${fullKey}" (${locale})`);
  return fullKey;
}

export function createTranslator<N extends Namespace>(messages: Messages, locale: Locale, namespace: N): Translator<N> {
  return (key, vars) => resolve(messages, locale, `${namespace}.${key}`, vars);
}

export function createGlobalTranslator(messages: Messages, locale: Locale): GlobalTranslator {
  return (key, vars) => resolve(messages, locale, key, vars);
}

/** Marks a server-side message (action errors, validation) to be translated in `guard()`. */
export const I18N_PREFIX = "i18n:";
export const msg = (key: Paths<Messages>, vars?: Vars) => (vars ? `${I18N_PREFIX}${key}|${JSON.stringify(vars)}` : `${I18N_PREFIX}${key}`);

export function translateMarked(t: GlobalTranslator, value: string): string {
  if (!value.startsWith(I18N_PREFIX)) return value;
  const body = value.slice(I18N_PREFIX.length);
  const bar = body.indexOf("|");
  if (bar === -1) return t(body as Paths<Messages>);
  try {
    return t(body.slice(0, bar) as Paths<Messages>, JSON.parse(body.slice(bar + 1)) as Vars);
  } catch {
    return t(body.slice(0, bar) as Paths<Messages>);
  }
}
