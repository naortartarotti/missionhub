import type { GlobalTranslator } from "@/i18n/translate";

export type Mobility = {
  travel: string | null;
  relocation: string | null;
  destinations: string[];
  workAuthorization: string[];
  hasPassport: boolean | null;
};

const TRAVEL = ["none", "occasional", "frequent"] as const;
const RELOCATION = ["none", "region", "country", "international"] as const;

/** Country name in a given BCP 47 locale (falls back to the ISO code). */
export function countryNamer(intlLocale: string): (code: string) => string {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([intlLocale], { type: "region" });
  } catch {}
  return (code) => names?.of(code) ?? code;
}

/**
 * Human-readable lines for a candidate's mobility, in the viewer's language. Used wherever mobility
 * is shown outside the candidate profile: the referral composer, a received referral, and the
 * candidate's own confirmation page. Passport countries are never part of it.
 */
export function mobilityLines(m: Mobility, t: GlobalTranslator, countryName: (code: string) => string): string[] {
  const lines: string[] = [];
  const travel = TRAVEL.find((x) => x === m.travel);
  if (travel) lines.push(t(`candidates.mobility.travel.${travel}`));
  const relocation = RELOCATION.find((x) => x === m.relocation);
  if (relocation) {
    const dest = relocation !== "none" && m.destinations.length ? ` (${m.destinations.map(countryName).join(", ")})` : "";
    lines.push(t(`candidates.mobility.relocation.${relocation}`) + dest);
  }
  if (m.workAuthorization.length) lines.push(t("candidates.detail.workAuthorizationLine", { list: m.workAuthorization.map(countryName).join(", ") }));
  if (m.hasPassport !== null) lines.push(t(m.hasPassport ? "candidates.mobility.passport.yes" : "candidates.mobility.passport.no"));
  return lines;
}
