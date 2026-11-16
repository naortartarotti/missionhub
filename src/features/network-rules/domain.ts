/**
 * Pure Network Rules helpers (N10). The database is authoritative for every hash, marker check and
 * rule list at publication (supabase/migrations/20261116001000_network_rules_versions.sql); these
 * mirror it so the publish form can warn early, the seed can be generated, and tests can prove the
 * two agree. Client-safe (no Node imports): the SHA-256 helper lives in ./hash (server and scripts).
 */

export const RULES_LOCALES = ["en", "fr-CA", "pt-BR"] as const;
export type RulesLocale = (typeof RULES_LOCALES)[number];

export const VERSION_TYPES = ["initial", "material", "non_material", "legally_required"] as const;
export type VersionType = (typeof VERSION_TYPES)[number];

/** BR-2 b: none of these may reach a published text. */
export const FORBIDDEN_MARKERS = ["<!--", "[TODO", "[placeholder", "⚖️"] as const;

export const isRulesLocale = (v: unknown): v is RulesLocale => typeof v === "string" && (RULES_LOCALES as readonly string[]).includes(v);

/** CRLF and lone CR become LF (what the database stores and hashes; a browser textarea sends CRLF). */
export function normalizeRulesText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export type MarkerHit = { line: number; marker: (typeof FORBIDDEN_MARKERS)[number] };

/** Every forbidden marker with its 1-based line number, in line order (same order as the RPC's detail). */
export function findRulesMarkers(text: string): MarkerHit[] {
  const hits: MarkerHit[] = [];
  normalizeRulesText(text)
    .split("\n")
    .forEach((line, i) => {
      for (const marker of [...FORBIDDEN_MARKERS].sort()) if (line.includes(marker)) hits.push({ line: i + 1, marker });
    });
  return hits;
}

/** Rule numbers in text order, from lines starting with **N.N** (the en.md format). */
export function extractRuleNumbers(text: string): string[] {
  return [...normalizeRulesText(text).matchAll(/^\*\*(\d+\.\d+)\*\*/gm)].map((m) => m[1]);
}

/** App UI locale → rules text locale (spec §2.0). */
export function rulesLocaleFor(uiLocale: string): RulesLocale {
  if (uiLocale.startsWith("fr")) return "fr-CA";
  if (uiLocale.startsWith("pt")) return "pt-BR";
  return "en";
}

/** BR-10: French first for Québec orgs, otherwise the user's UI locale; `?lang=` overrides. */
export function defaultRulesLocale(opts: { quebec: boolean; uiLocale: string; override?: string | null }): RulesLocale {
  if (isRulesLocale(opts.override)) return opts.override;
  return opts.quebec ? "fr-CA" : rulesLocaleFor(opts.uiLocale);
}

/** The first day a material version may take effect: publication date (ET) + 30 calendar days (BR-3). */
export function earliestMaterialEffectiveDate(todayEt: string): string {
  const d = new Date(`${todayEt}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

export type StripOptions = { shipped: string[]; notShipped: string[]; locale: RulesLocale; todoReplacement?: (inner: string) => string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The publish-copy procedure of docs/content/network-rules/PUBLISHING.md §3 steps 2–6, as code:
 * ships-with / until blocks per the mechanism table, every other comment removed, the H1 and status
 * line removed, whitespace cleaned, fr-CA no-break spaces. `todoReplacement`, when given, replaces the
 * remaining `[TODO: …]` placeholders (used only for the local draft seed; a real publication must have
 * them filled in the source, and the publish RPC refuses any that remain).
 */
export function stripForPublish(source: string, opts: StripOptions): string {
  let s = normalizeRulesText(source);
  for (const t of opts.shipped) {
    const e = escapeRe(t);
    s = s.replace(new RegExp(`<!-- ships with ${e} -->([\\s\\S]*?)<!-- /ships with ${e} -->`, "g"), "$1");
    s = s.replace(new RegExp(`<!-- until ${e} ships -->[\\s\\S]*?<!-- /until ${e} ships -->`, "g"), "");
  }
  for (const t of opts.notShipped) {
    const e = escapeRe(t);
    s = s.replace(new RegExp(`<!-- ships with ${e} -->[\\s\\S]*?<!-- /ships with ${e} -->`, "g"), "");
    s = s.replace(new RegExp(`<!-- until ${e} ships -->([\\s\\S]*?)<!-- /until ${e} ships -->`, "g"), "$1");
  }
  s = s.replace(/[ \t]*<!--[\s\S]*?-->/g, "");
  s = s.replace(/^# [^\n]*\n/m, "");
  s = s.replace(/^\*\*Vers(?:ion|ão) ?:\*\*[^\n]*\n/m, "");
  if (opts.todoReplacement) s = s.replace(/\[TODO:\s*([^\]]*)\]/g, (_, inner: string) => opts.todoReplacement!(inner.trim()));
  s = s.replace(/[ \t]+$/gm, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/^\n+/, "");
  s = s.replace(/\n*$/, "\n");
  if (opts.locale === "fr-CA") {
    s = s.replace(/ :/g, " :").replace(/« /g, "« ").replace(/ »/g, " »").replace(/(\d) %/g, "$1 %");
  }
  return s;
}

// ---------------------------------------------------------------------------
// Conduct reports (BR-17)
// ---------------------------------------------------------------------------
export const CONDUCT_CATEGORIES = [
  "went_around",
  "misused",
  "shared_outside",
  "hire_payout",
  "false_info",
  "job_terms",
  "discrimination",
  "retaliation",
  "other",
] as const;
export type ConductCategory = (typeof CONDUCT_CATEGORIES)[number];
export type ReporterSide = "source" | "target" | "job";

/** The options shown per entry point and side (9 / 7 / 5). The server accepts any of the 9. */
export function categoriesForSide(side: ReporterSide): ConductCategory[] {
  if (side === "source") return [...CONDUCT_CATEGORIES];
  if (side === "target") return CONDUCT_CATEGORIES.filter((c) => c !== "hire_payout" && c !== "job_terms");
  return ["false_info", "job_terms", "discrimination", "retaliation", "other"];
}

/** Admin-only "possible 9.4" marker (RD-044): never shown to reporters. */
export function isPossibleImmediateHold(category: string | null | undefined, adminCategory?: string | null): boolean {
  return category === "shared_outside" || category === "false_info" || adminCategory === "shared_outside" || adminCategory === "false_info";
}

export const SANCTION_LEVELS = ["warning", "network_hold", "suspension", "termination"] as const;
export type SanctionLevel = (typeof SANCTION_LEVELS)[number];

/** Ladder rank (0 = no level). A review may only move to a strictly lower rank (BR-31). */
export function sanctionRank(level: SanctionLevel | "none" | null | undefined): number {
  return level ? ({ none: 0, warning: 1, network_hold: 2, suspension: 3, termination: 4 } as const)[level] : 0;
}

/** Levels a reviewer may pick when reducing `current` (lower levels plus "none" = lift). */
export function reductionOptions(current: SanctionLevel | null): (SanctionLevel | "none")[] {
  const rank = sanctionRank(current);
  return (["none", "warning", "network_hold", "suspension"] as const).filter((l) => sanctionRank(l) < rank);
}

export const IMMEDIATE_HOLD_GROUNDS = ["2.3", "4.8"] as const;
