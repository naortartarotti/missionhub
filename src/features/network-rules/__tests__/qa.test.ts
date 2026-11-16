import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseRulesMarkdown } from "../markdown";
import { RulesText } from "../components/rules-text";
import { acceptRulesSchema, fileReportSchema, responseSchema, reviewRequestSchema, followupReplySchema, reportReplySchema, immediateHoldSchema, conductDecisionSchema, liftSanctionSchema } from "../schemas";
import { safeNext } from "@/features/auth/schemas";

/**
 * N10 QA (unit): Markdown / XSS in the rules text, Zod boundaries of every member action (spec §5.16),
 * and the `next` / `from` redirect guard used by the accept-rules and versions pages (AC-117 / H).
 * `it.fails` marks a reproduced bug (QA-N10-xx in qa-report.md); drop `.fails` once fixed.
 */

const uuid = "4b0b7a3e-2f5c-4b8e-9a51-0c1d2e3f4a5b";

describe("rules text: no markup, links or scripts survive (Q-D16, AC-117)", () => {
  const hostile = [
    "## 1. Membership <script>alert(1)</script>",
    "",
    "**1.1** Click [here](javascript:alert(1)) or <a href=\"javascript:alert(2)\">here</a>.",
    "",
    "<img src=x onerror=alert(3)>",
    "",
    "- <iframe src=\"https://evil.example\"></iframe>",
    "- **bold <b onmouseover=alert(4)>x</b>**",
    "",
    "<!-- hidden --><style>body{display:none}</style>",
  ].join("\n");

  it("parses everything as plain text segments", () => {
    const blocks = parseRulesMarkdown(hostile);
    for (const b of blocks) {
      const keys = b.kind === "heading" ? Object.keys(b) : b.kind === "paragraph" ? Object.keys(b) : Object.keys(b);
      expect(keys.every((k) => ["kind", "level", "id", "text", "inlines", "ordered", "items"].includes(k))).toBe(true);
    }
  });

  it("renders escaped: no element, attribute or URL from the stored text reaches the DOM", () => {
    const html = renderToStaticMarkup(createElement(RulesText, { body: hostile, locale: "en" }));
    for (const bad of ["<script", "<img", "<iframe", "<a ", "<style", "<b "]) expect(html, bad).not.toContain(bad);
    // No real attribute from the text: only escaped copies (&quot;) appear inside text nodes.
    expect(html).not.toMatch(/<[a-z0-9]+[^>]*\s(href|src|on[a-z]+|style)=/i);
    expect(html).toContain("&lt;script&gt;");
    // Heading ids come from a slug, never the raw text.
    for (const m of html.matchAll(/id="([^"]+)"/g)) expect(m[1]).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("member action schemas: boundaries (spec §5.16)", () => {
  const base = { referralId: uuid, category: "shared_outside", description: "x".repeat(20), attested: true };

  it("report: 20–4,000 characters after trim, attestation literal true, exactly one target, ≤ 5 files, known category, ISO date", () => {
    expect(fileReportSchema.safeParse(base).success).toBe(true);
    expect(fileReportSchema.safeParse({ ...base, description: "x".repeat(4000) }).success).toBe(true);
    for (const bad of [
      { description: "x".repeat(19) },
      { description: `  ${"x".repeat(18)}  ` },
      { description: "x".repeat(4001) },
      { attested: false },
      { attested: "true" },
      { category: "bogus" },
      { matchId: uuid },
      { referralId: undefined },
      { referralId: "not-a-uuid" },
      { fileIds: Array.from({ length: 6 }, () => uuid) },
      { fileIds: ["x"] },
      { occurredOn: "16/11/2026" },
    ]) {
      expect(fileReportSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad).slice(0, 60)).toBe(false);
    }
  });

  it("response 20–8,000; reply / follow-up 20–4,000; review 20–8,000", () => {
    const at = (s: typeof responseSchema | typeof reviewRequestSchema, key: string, extra: Record<string, unknown>, n: number) => s.safeParse({ ...extra, [key]: "y".repeat(n) }).success;
    expect([at(responseSchema, "body", { noticeId: uuid }, 19), at(responseSchema, "body", { noticeId: uuid }, 20), at(responseSchema, "body", { noticeId: uuid }, 8000), at(responseSchema, "body", { noticeId: uuid }, 8001)]).toEqual([false, true, true, false]);
    expect([followupReplySchema.safeParse({ followupId: uuid, body: "y".repeat(4000) }).success, followupReplySchema.safeParse({ followupId: uuid, body: "y".repeat(4001) }).success]).toEqual([true, false]);
    expect([reportReplySchema.safeParse({ caseId: uuid, body: "y".repeat(4001) }).success, reviewRequestSchema.safeParse({ caseId: uuid, text: "y".repeat(8001) }).success]).toEqual([false, false]);
  });

  it("acceptance: at least one statement, known locale, uuid version", () => {
    expect(acceptRulesSchema.safeParse({ versionId: uuid, locale: "fr-CA", personal: true, forOrg: false }).success).toBe(true);
    expect(acceptRulesSchema.safeParse({ versionId: uuid, locale: "en", personal: false, forOrg: false }).success).toBe(false);
    expect(acceptRulesSchema.safeParse({ versionId: uuid, locale: "fr", personal: true, forOrg: false }).success).toBe(false);
    expect(acceptRulesSchema.safeParse({ versionId: "1.0", locale: "en", personal: true, forOrg: false }).success).toBe(false);
  });

  it("admin: only two immediate-hold grounds; suspension needs 'why not a hold'; lift needs a reason", () => {
    const notice = { caseId: uuid, language: "en", conductDate: "2026-11-16", rulesVersionId: uuid, rulesCited: ["2.3"], allegation: "a".repeat(20), allegedWhen: "now", evidenceSummary: "e".repeat(20) };
    expect(["2.3", "4.8"].map((g) => immediateHoldSchema.safeParse({ ...notice, ground: g }).success)).toEqual([true, true]);
    expect(["3.4", "2.3 ", "", "4.8;"].map((g) => immediateHoldSchema.safeParse({ ...notice, ground: g }).success)).toEqual([false, false, false, false]);
    const d = { caseId: uuid, noticeId: uuid, outcome: "breach", finding: "f".repeat(50), rulesCited: ["2.3"], level: "suspension" };
    expect(conductDecisionSchema.safeParse(d).success).toBe(false);
    expect(conductDecisionSchema.safeParse({ ...d, whyNotHold: "w".repeat(20) }).success).toBe(true);
    expect(liftSanctionSchema.safeParse({ orgId: uuid, reason: "    " }).success).toBe(false);
  });
});

describe("redirect guard for ?next= (accept-rules) and ?from= (versions page)", () => {
  it("refuses protocol-relative, absolute and backslash targets", () => {
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", ""]) expect(safeNext(bad, "/fallback")).toBe("/fallback");
    expect(safeNext("/workspace/acme/overview", "/fallback")).toBe("/workspace/acme/overview");
  });

  // QA-N10-04 (MAJOR, frontend — shared helper in features/auth/schemas.ts): a tab or newline after the
  // first slash passes the guard, and browsers / the WHATWG URL parser strip it, so "/\t/evil.example"
  // becomes "//evil.example" (open redirect after accepting the rules: router.push(nextHref)).
  it("QA-N10-04: refuses a target that becomes protocol-relative once tabs / newlines are stripped", () => {
    for (const bad of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example"]) {
      // The URL parser turns these into another origin:
      expect(new URL(bad, "https://app.example").origin).toBe("https://evil.example");
      expect(safeNext(bad, "/fallback")).toBe("/fallback");
    }
  });
});

describe("round 2: safeNext bypass battery (QA-N10-04 fix)", () => {
  const base = "https://app.example";
  const hostile = [
    "/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/\u000b/evil.example", "/\u000c/evil.example", "/\u0000/evil.example",
    "\t//evil.example", " /evil", "/ /evil.example", "/ /evil.example", "/ /evil.example", "/　/evil.example",
    "/\\evil.example", "\\\\evil.example", "/\\/evil.example", "//evil.example", "///evil.example", "https:evil.example",
    "http://evil.example", "javascript:alert(1)", "/%09/evil.example".replace("%09", "\t"), "", "x".repeat(10),
    `/${"a".repeat(2100)}`,
  ];
  it("refuses every hostile shape, and nothing it returns leaves the origin", () => {
    for (const h of hostile) expect(safeNext(h, "/fallback"), JSON.stringify(h).slice(0, 40)).toBe("/fallback");
    for (const h of [...hostile, "/%2F%2Fevil.example", "/.//evil.example", "/..//evil.example", "/%5Cevil.example", "/@evil.example", "/?next=//evil.example"]) {
      expect(new URL(safeNext(h, "/fallback"), base).origin).toBe(base);
    }
  });
  it("keeps normal in-app targets", () => {
    for (const ok of ["/workspace/acme/overview", "/workspace/acme/accept-rules?v=1.0", "/network-rules?org=acme&lang=fr-CA#upcoming", "/workspace/acme/reports/4b0b7a3e-2f5c-4b8e-9a51-0c1d2e3f4a5b"]) {
      expect(safeNext(ok, "/fallback")).toBe(ok);
    }
  });
});
