import { describe, expect, it } from "vitest";
import { acceptanceNeeds, cleanSupportEmail, isClosedReporterStatus, isFutureInstant, noticeBannerApplies, reporterStatusKey, selectBanners, sanctionStatusKey } from "../ui-state";
import { parseInline, parseRulesMarkdown, ruleAnchor, sectionAnchor } from "../markdown";
import { rulesLocaleOrder } from "../locale";
import { restrictionReasonOf, hiddenReasonOf, NUDGE_CHIP, NUDGE_REASONS } from "@/features/jobs/nudge";
import { approxBusinessDaysLeft, conductStateKey } from "../admin-ui";

const rules = (over: Partial<Parameters<typeof selectBanners>[0]["rules"]> = {}) => ({
  gateRequired: false,
  userRestricted: false,
  upcoming: null,
  memberAcceptedUpcoming: false,
  orgAcceptedUpcoming: null,
  ...over,
});
const upcoming = { id: "v2", label: "1.1", effectiveAt: "2099-01-01T05:00:00Z", type: "material" };

describe("selectBanners (S3 precedence, at most two)", () => {
  it("shows nothing behind the gate", () => {
    expect(selectBanners({ restriction: "network_hold", settlementMode: false, settlementKind: null, rules: rules({ gateRequired: true }), isOrgAdmin: true })).toEqual([]);
  });
  it("settlement mode shows only B6, never B5", () => {
    expect(selectBanners({ restriction: "suspended", settlementMode: true, settlementKind: "suspended", rules: rules({ upcoming }), isOrgAdmin: true })).toEqual(["settlement_suspended"]);
    expect(selectBanners({ restriction: "terminated", settlementMode: true, settlementKind: "terminated", rules: rules(), isOrgAdmin: false })).toEqual(["settlement_terminated"]);
  });
  it("hold > rules (org) > per user, plus B5", () => {
    expect(selectBanners({ restriction: "network_hold", settlementMode: false, settlementKind: null, rules: rules({ userRestricted: true, upcoming }), isOrgAdmin: false })).toEqual(["hold", "notice"]);
    expect(selectBanners({ restriction: "rules_not_accepted", settlementMode: false, settlementKind: null, rules: rules({ userRestricted: true }), isOrgAdmin: false })).toEqual(["rules_org"]);
    expect(selectBanners({ restriction: null, settlementMode: false, settlementKind: null, rules: rules({ userRestricted: true }), isOrgAdmin: false })).toEqual(["rules_user"]);
    expect(selectBanners({ restriction: null, settlementMode: false, settlementKind: null, rules: rules(), isOrgAdmin: false })).toEqual([]);
  });
  it("B5: until the member accepted; an org admin also until the org accepted", () => {
    expect(noticeBannerApplies({ rules: rules({ upcoming, memberAcceptedUpcoming: true }), isOrgAdmin: false })).toBe(false);
    expect(noticeBannerApplies({ rules: rules({ upcoming, memberAcceptedUpcoming: true }), isOrgAdmin: true })).toBe(true);
    expect(noticeBannerApplies({ rules: rules({ upcoming, memberAcceptedUpcoming: true, orgAcceptedUpcoming: { at: "2026-11-16", byName: "A" } }), isOrgAdmin: true })).toBe(false);
    expect(noticeBannerApplies({ rules: rules({ upcoming: { ...upcoming, type: "non_material" } }), isOrgAdmin: false })).toBe(false);
  });
});

describe("acceptanceNeeds (§2.2 table, N10-D18)", () => {
  it("recruiters: personal only", () => expect(acceptanceNeeds({ isOrgAdmin: false, settlementMode: false, orgAccepted: false, memberAccepted: false })).toEqual({ personal: true, org: false, done: false }));
  it("org admin, org not accepted: both", () => expect(acceptanceNeeds({ isOrgAdmin: true, settlementMode: false, orgAccepted: false, memberAccepted: false })).toEqual({ personal: true, org: true, done: false }));
  it("org admin, org accepted: personal only", () => expect(acceptanceNeeds({ isOrgAdmin: true, settlementMode: false, orgAccepted: true, memberAccepted: false }).org).toBe(false));
  it("settlement mode: personal only, whatever the role", () => expect(acceptanceNeeds({ isOrgAdmin: true, settlementMode: true, orgAccepted: false, memberAccepted: false }).org).toBe(false));
  it("org admin who accepted personally but org didn't: still needs the org statement", () =>
    expect(acceptanceNeeds({ isOrgAdmin: true, settlementMode: false, orgAccepted: false, memberAccepted: true })).toEqual({ personal: true, org: true, done: false }));
  it("everything accepted: done", () => expect(acceptanceNeeds({ isOrgAdmin: true, settlementMode: false, orgAccepted: true, memberAccepted: true }).done).toBe(true));
});

describe("reporter statuses (§2.9)", () => {
  it("only the reporting user sees 'Your input needed'", () => {
    expect(reporterStatusKey("input_needed", true)).toBe("status.input");
    expect(reporterStatusKey("input_needed", false)).toBe("status.inReview");
  });
  it("the four closed outcomes carry the no-change line", () => {
    expect(["closed", "action_taken", "no_breach", "insufficient_evidence"].every((s) => isClosedReporterStatus(s as never))).toBe(true);
    expect(isClosedReporterStatus("in_review")).toBe(false);
  });
  it("sanction statuses map to labels (superseded has no label)", () => expect(sanctionStatusKey("superseded")).toBe("lifted"));
});

describe("RulesText markdown (Q-D16: no HTML)", () => {
  it("parses headings with section anchors, rule paragraphs and lists", () => {
    const blocks = parseRulesMarkdown("## 1. Membership\n\n**1.1** Your organization joins.\n\n- one\n- two\n\n### Notes");
    expect(blocks[0]).toEqual({ kind: "heading", level: 3, id: sectionAnchor("1"), text: "1. Membership" });
    expect(blocks[1]).toMatchObject({ kind: "paragraph", id: ruleAnchor("1.1") });
    expect(blocks[2]).toMatchObject({ kind: "list", ordered: false, items: [[{ text: "one" }], [{ text: "two" }]] });
    expect(blocks[3]).toMatchObject({ kind: "heading", level: 4 });
  });
  it("keeps raw HTML and comments out of the output", () => {
    const blocks = parseRulesMarkdown("<!-- hidden -->\n<script>alert(1)</script> text");
    expect(JSON.stringify(blocks)).not.toContain("hidden");
    // Tags stay plain text: React escapes them, nothing is rendered as markup.
    expect(blocks[0]).toEqual({ kind: "paragraph", id: undefined, inlines: [{ text: "<script>alert(1)</script> text" }] });
  });
  it("bold and italic runs", () => {
    expect(parseInline("a **b** *c* d")).toEqual([{ text: "a " }, { text: "b", bold: true }, { text: " " }, { text: "c", italic: true }, { text: " d" }]);
  });
  it("CRLF from a textarea parses like LF", () => {
    expect(parseRulesMarkdown("**2.3** Keep it.\r\n\r\n**2.4** Don't.")).toHaveLength(2);
  });
});

describe("misc", () => {
  it("rules language switch: Français first when the default is fr-CA", () => {
    expect(rulesLocaleOrder("fr-CA")[0]).toBe("fr-CA");
    expect(rulesLocaleOrder("en")[0]).toBe("en");
  });
  it("support address only when plain", () => {
    expect(cleanSupportEmail("help@missionhub.app")).toBe("help@missionhub.app");
    expect(cleanSupportEmail('x@y.z"><script>')).toBeNull();
    expect(cleanSupportEmail(null)).toBeNull();
  });
  it("isFutureInstant", () => {
    expect(isFutureInstant("2099-01-01T00:00:00Z")).toBe(true);
    expect(isFutureInstant("2000-01-01T00:00:00Z")).toBe(false);
    expect(isFutureInstant(null)).toBe(false);
  });
  it("job nudges: org restriction first, with chips (§2.6 item 2)", () => {
    expect(NUDGE_REASONS.slice(0, 2)).toEqual(["network_hold", "rules_not_accepted"]);
    expect(restrictionReasonOf("network_hold")).toBe("network_hold");
    expect(restrictionReasonOf("suspended")).toBeNull();
    expect(hiddenReasonOf({ partner_visible: false, hidden_reason: "rules_not_accepted" })).toBe("rules_not_accepted");
    expect(NUDGE_CHIP.network_hold).toBe("nudge.chipHold");
  });
  it("admin queue state keys and the weekday hint", () => {
    expect(conductStateKey("waiting_for_reporter")).toBe("waiting_reporter");
    expect(approxBusinessDaysLeft("2000-01-01T00:00:00Z")).toBeNull();
    // Friday noon → next Monday noon: one weekday.
    expect(approxBusinessDaysLeft("2026-11-23T17:00:00Z", new Date("2026-11-20T17:00:00Z"))).toBe(1);
    // 11:59 p.m. ET on Mon Nov 30 is Dec 1 in UTC: still 10 weekdays from Mon Nov 16 (matches the server).
    expect(approxBusinessDaysLeft("2026-12-01T04:59:00Z", new Date("2026-11-16T16:00:00Z"))).toBe(10);
  });
});

describe("safeNext (QA-N10-04)", async () => {
  const { safeNext } = await import("@/features/auth/schemas");
  it("keeps internal paths, queries and fragments", () => {
    for (const ok of ["/", "/onboarding", "/workspace/acme/overview", "/workspace/acme/accept-rules?v=1.1&next=%2Fworkspace%2Facme", "/network-rules#upcoming", "/workspace/acme/reports/3f2a?tab=org"]) expect(safeNext(ok, "/f")).toBe(ok);
  });
  it("refuses anything a browser could turn into another origin", () => {
    for (const bad of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/ /evil.example", "/\u0000/evil", "//evil.example", "/\\evil.example", "\\/evil.example", "https://evil.example", "javascript:alert(1)", "evil.example", "", "/ /evil"]) expect(safeNext(bad, "/f")).toBe("/f");
    expect(safeNext(null, "/f")).toBe("/f");
    expect(safeNext(undefined, "/f")).toBe("/f");
  });
});
