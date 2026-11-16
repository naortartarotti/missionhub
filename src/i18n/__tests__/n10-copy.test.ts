import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../messages/en";
import fr from "../messages/fr";
import pt from "../messages/pt";

/**
 * N10 (network-rules-enforcement): every key of spec §5 exists in en / fr / pt with the final copy.
 * Normalised for the file conventions: fr no-break spaces before ":" and inside « », and straight
 * apostrophes in the existing namespaces (only `network.json` keeps the curly ’, spec §5.0).
 */
type Tree = { [k: string]: string | Tree };
const SPEC = path.resolve(import.meta.dirname, "../../../docs/specs/network-rules-enforcement/spec.md");

function specRows() {
  const lines = readFileSync(SPEC, "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith("## 5. Copy"));
  const end = lines.findIndex((l) => l.startsWith("## 6. Accessibility"));
  const rows: { key: string; en: string; fr: string; pt: string }[] = [];
  for (const l of lines.slice(start, end)) {
    if (!l.startsWith("| `")) continue;
    const cells = l.trim().replace(/^\||\|$/g, "").split(" | ").map((c) => c.trim());
    const m = /^`([A-Za-z0-9_.]+)`/.exec(cells[0]);
    if (!m || cells.length !== 4 || !m[1].includes(".")) continue;
    if (!/^(network|admin|labels|settings|jobs|onboarding|referrals|opportunities)\./.test(m[1])) continue;
    rows.push({ key: m[1], en: cells[1], fr: cells[2], pt: cells[3] });
  }
  return rows;
}

const lookup = (tree: Tree, key: string) => key.split(".").reduce<unknown>((n, k) => (n && typeof n === "object" ? (n as Tree)[k] : undefined), tree);
const norm = (s: string) => s.replace(/ /g, " ").replace(/’/g, "'");

describe("N10 copy (spec §5)", () => {
  const rows = specRows();
  it("finds the 826 keys", () => expect(rows).toHaveLength(826));
  it.each([
    ["en", en, "en"],
    ["fr", fr, "fr"],
    ["pt", pt, "pt"],
  ] as const)("%s matches the spec", (_, messages, col) => {
    const wrong = rows.filter((r) => {
      const v = lookup(messages as unknown as Tree, r.key);
      return typeof v !== "string" || norm(v) !== norm(r[col]);
    });
    expect(wrong.map((r) => r.key)).toEqual([]);
  });
  it("fr uses a no-break space before colons in N10 strings", () => {
    const bad = rows.filter((r) => {
      const v = lookup(fr as unknown as Tree, r.key);
      return typeof v === "string" && / :/.test(v);
    });
    expect(bad.map((r) => r.key)).toEqual([]);
  });
  it("the BR-14 partner sentence is one key and never names a reason", () => {
    for (const m of [en, fr, pt]) {
      const s = (m as unknown as { network: { partner: { notTakingReferrals: string } } }).network.partner.notTakingReferrals;
      expect(s).toContain("{org}");
      expect(s).not.toMatch(/hold|restri|suspen|termin|exclu|règle|rules|regras/i);
    }
  });
});
