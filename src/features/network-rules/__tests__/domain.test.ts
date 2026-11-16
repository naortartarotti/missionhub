import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  categoriesForSide,
  defaultRulesLocale,
  earliestMaterialEffectiveDate,
  extractRuleNumbers,
  findRulesMarkers,
  isPossibleImmediateHold,
  normalizeRulesText,
  reductionOptions,
  rulesLocaleFor,
  sanctionRank,
  stripForPublish,
} from "../domain";
import { rulesSha256 } from "../hash";
import { conductDecisionSchema, fileReportSchema, immediateHoldSchema } from "../schemas";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const draft = (locale: string) => readFileSync(path.resolve(import.meta.dirname, "../../../../docs/content/network-rules", `${locale}.md`), "utf8");

describe("hashing (BR-1, EC-4)", () => {
  it("normalizes CRLF and lone CR to LF before hashing", () => {
    expect(normalizeRulesText("a\r\nb\rc\n")).toBe("a\nb\nc\n");
    expect(rulesSha256("**1.1** Rule\r\n")).toBe(rulesSha256("**1.1** Rule\n"));
    expect(rulesSha256("**1.1** Rule\r\n")).toBe(sha("**1.1** Rule\n"));
  });

  it("hashes UTF-8 text, so accents and no-break spaces change the hash", () => {
    expect(rulesSha256("Règles")).toBe(sha("Règles"));
    expect(rulesSha256("a :")).not.toBe(rulesSha256("a :"));
  });

  it("matches the fingerprints written into the generated seed", () => {
    const seed = readFileSync(path.resolve(import.meta.dirname, "../../../../supabase/seed.sql"), "utf8");
    const body = (locale: string) => seed.split(`'${locale}', $rules$`)[1].split("$rules$")[0];
    for (const l of ["en", "fr-CA", "pt-BR"]) expect(seed).toContain(`${l} ${rulesSha256(body(l))}`);
  });
});

describe("markers (BR-2 b)", () => {
  it("finds every forbidden marker with its line", () => {
    const hits = findRulesMarkers("ok\n<!-- c -->\nx [TODO: y]\n[placeholder] ⚖️");
    expect(hits).toEqual([
      { line: 2, marker: "<!--" },
      { line: 3, marker: "[TODO" },
      { line: 4, marker: "[placeholder" },
      { line: 4, marker: "⚖️" },
    ]);
  });

  it("the raw drafts are refused, the stripped seed copies aren't", () => {
    expect(findRulesMarkers(draft("en")).length).toBeGreaterThan(0);
    for (const locale of ["en", "fr-CA", "pt-BR"] as const) {
      const out = stripForPublish(draft(locale), { shipped: ["P0-3"], notShipped: ["N5", "access expiry (after N3)", "P1-5"], locale, todoReplacement: (i) => `(draft: ${i})` });
      expect(findRulesMarkers(out)).toEqual([]);
      expect(out.startsWith("#")).toBe(false); // the H1 is removed
      expect(out.split("\n").filter((l) => l.startsWith("## ")).length).toBe(11);
      expect(out.endsWith("\n") && !out.endsWith("\n\n")).toBe(true);
    }
  });
});

describe("publish copy procedure (PUBLISHING.md §3)", () => {
  const src = "# Title\n\n**Version:** v1 — draft\n\n**8.1** Report it<!-- ships with P0-3 --> with the button<!-- /ships with P0-3 --><!-- until P0-3 ships --> by email<!-- /until P0-3 ships -->.\n\n**1.6** <!-- ships with N5 -->Badge.<!-- /ships with N5 -->\n\nText. <!-- ⚖️ counsel: x -->\n";

  it("keeps shipped blocks, drops unshipped ones, reverses until-blocks, strips comments", () => {
    const out = stripForPublish(src, { shipped: ["P0-3"], notShipped: ["N5"], locale: "en" });
    expect(out).toBe("**8.1** Report it with the button.\n\n**1.6**\n\nText.\n");
  });

  it("fr-CA gets no-break spaces before colons and inside guillemets", () => {
    const out = stripForPublish("Note : « oui » 10 %\n", { shipped: [], notShipped: [], locale: "fr-CA" });
    expect(out).toBe("Note : « oui » 10 %\n");
  });

  it("the three drafts share the same rule numbers (checked again by the publish RPC)", () => {
    const nums = (["en", "fr-CA", "pt-BR"] as const).map((l) => extractRuleNumbers(stripForPublish(draft(l), { shipped: ["P0-3"], notShipped: ["N5"], locale: l })));
    expect(nums[1]).toEqual(nums[0]);
    expect(nums[2]).toEqual(nums[0]);
    expect(nums[0]).toContain("2.3");
    expect(nums[0]).toContain("4.8");
  });
});

describe("locales (BR-10)", () => {
  it("maps UI locales and puts French first for Québec orgs; ?lang overrides", () => {
    expect([rulesLocaleFor("fr"), rulesLocaleFor("pt"), rulesLocaleFor("en")]).toEqual(["fr-CA", "pt-BR", "en"]);
    expect(defaultRulesLocale({ quebec: true, uiLocale: "en" })).toBe("fr-CA");
    expect(defaultRulesLocale({ quebec: true, uiLocale: "en", override: "en" })).toBe("en");
    expect(defaultRulesLocale({ quebec: false, uiLocale: "pt", override: "xx" })).toBe("pt-BR");
  });

  it("the earliest material effective date is 30 calendar days after publication (BR-3)", () => {
    expect(earliestMaterialEffectiveDate("2026-11-16")).toBe("2026-12-16");
    expect(earliestMaterialEffectiveDate("2027-02-15")).toBe("2027-03-17");
  });
});

describe("conduct categories and the ladder (BR-17, BR-31)", () => {
  it("9 / 7 / 5 categories per context, 'other' last", () => {
    expect(categoriesForSide("source")).toHaveLength(9);
    expect(categoriesForSide("target")).toEqual(["went_around", "misused", "shared_outside", "false_info", "discrimination", "retaliation", "other"]);
    expect(categoriesForSide("job")).toEqual(["false_info", "job_terms", "discrimination", "retaliation", "other"]);
    for (const s of ["source", "target", "job"] as const) expect(categoriesForSide(s).at(-1)).toBe("other");
  });

  it("possible 9.4 marks categories 3 and 5 (reporter or admin label)", () => {
    expect(isPossibleImmediateHold("shared_outside")).toBe(true);
    expect(isPossibleImmediateHold("other", "false_info")).toBe(true);
    expect(isPossibleImmediateHold("discrimination", null)).toBe(false);
  });

  it("a review only offers lower levels or a lift", () => {
    expect(sanctionRank("termination")).toBeGreaterThan(sanctionRank("suspension"));
    expect(reductionOptions("suspension")).toEqual(["none", "warning", "network_hold"]);
    expect(reductionOptions("warning")).toEqual(["none"]);
    expect(reductionOptions(null)).toEqual([]);
  });
});

describe("schemas", () => {
  const id = "7f1c2a2e-5b0a-4c7e-9a10-2f4e2f9b1c11";
  it("a report needs exactly one of referral / match, a category, 20–4,000 characters and the attestation", () => {
    expect(fileReportSchema.safeParse({ referralId: id, category: "other", description: "x".repeat(20), attested: true }).success).toBe(true);
    expect(fileReportSchema.safeParse({ referralId: id, matchId: id, category: "other", description: "x".repeat(20), attested: true }).success).toBe(false);
    expect(fileReportSchema.safeParse({ referralId: id, category: "other", description: "short", attested: true }).success).toBe(false);
    expect(fileReportSchema.safeParse({ referralId: id, category: "other", description: "x".repeat(20), attested: false }).success).toBe(false);
    expect(fileReportSchema.safeParse({ referralId: id, category: "nope", description: "x".repeat(20), attested: true }).success).toBe(false);
  });

  it("the immediate-hold ground is a closed list", () => {
    const base = { caseId: id, language: "en", conductDate: "2026-11-01", rulesVersionId: id, rulesCited: ["2.3"], allegation: "x".repeat(20), allegedWhen: "Nov", evidenceSummary: "x".repeat(20) };
    expect(immediateHoldSchema.safeParse({ ...base, ground: "2.3" }).success).toBe(true);
    expect(immediateHoldSchema.safeParse({ ...base, ground: "3.4" }).success).toBe(false);
  });

  it("a breach decision needs a finding and rules; suspension and termination need 'why not a hold'", () => {
    const base = { caseId: id, noticeId: id, outcome: "breach", finding: "f".repeat(50), rulesCited: ["2.3"] };
    expect(conductDecisionSchema.safeParse({ ...base, level: "warning" }).success).toBe(true);
    expect(conductDecisionSchema.safeParse({ ...base, level: "suspension" }).success).toBe(false);
    expect(conductDecisionSchema.safeParse({ ...base, level: "suspension", whyNotHold: "w".repeat(20) }).success).toBe(true);
    expect(conductDecisionSchema.safeParse({ ...base, finding: "short" }).success).toBe(false);
    expect(conductDecisionSchema.safeParse({ caseId: id, noticeId: id, outcome: "no_breach" }).success).toBe(true);
  });
});
