import type { GlobalTranslator, Paths } from "@/i18n/translate";
import type { Messages } from "@/i18n/messages";

/** Evidence as stored on a match row. Rows scored before v2 have no `key`: show `label` then. */
export type StoredEvidence = { factor: string; label: string; key?: string; vars?: Record<string, string | number> };

const SENIORITY_VARS = new Set(["jobSeniority", "candidateSeniority"]);

/** Renders one reason / gap / blocker in the viewer's language. Works on server and client. */
export function evidenceText(e: StoredEvidence, t: GlobalTranslator): string {
  if (!e.key) return e.label;
  const vars: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(e.vars ?? {})) {
    if (SENIORITY_VARS.has(name)) vars[name] = t(`labels.seniority.${value}` as Paths<Messages>);
    else if (name === "travel") vars[name] = t(`labels.travel.${value}` as Paths<Messages>);
    else if (name === "jobArrangement") vars[name] = t(`labels.arrangement.${value}` as Paths<Messages>);
    else if (name === "candidateArrangements")
      vars[name] = String(value).split("/").map((a) => t(`labels.arrangement.${a}` as Paths<Messages>)).join("/");
    else vars[name] = value;
  }
  const key = `opportunities.evidence.${e.key}`;
  const text = t(key as Paths<Messages>, vars);
  return text === key ? e.label : text;
}
