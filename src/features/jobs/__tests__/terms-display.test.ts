import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en";
import fr from "@/i18n/messages/fr";
import { createGlobalTranslator } from "@/i18n/translate";
import { createFormatter } from "@/i18n/format";
import { changedRows, compareEarnings, feeLong, feeShort, shareAtHire, shareFigure, termsFromState, type TermsView } from "../terms-display";
import { hiddenReasonOf } from "../nudge";

const plain = (s: string) => s.replace(/[  ]/g, " ");
const tgEn = createGlobalTranslator(en, "en");
const tgFr = createGlobalTranslator(fr, "fr");
const fEn = createFormatter("en");
const fFr = createFormatter("fr");

const v1: TermsView = {
  versionNo: 1, publishedAt: "2026-11-01T12:00:00Z", kind: "job", feeBasis: "pct_base", rateBps: 2000, flatFeeMinor: null, minFeeMinor: null,
  currency: "CAD", searchType: "contingent_shared", guaranteeDays: 90, guaranteeRemedy: "replacement_then_prorata", paymentTermsDays: 30, ownershipMonths: 6,
};

describe("fee texts", () => {
  it("short form for the KPI tile, sent list and opportunities", () => {
    expect(feeShort(v1, tgEn, fEn)).toBe("20% of base");
    expect(plain(feeShort({ ...v1, feeBasis: "pct_total_cash", rateBps: 2250 }, tgFr, fFr))).toBe("22,5 % de la rémunération globale");
    expect(plain(feeShort({ ...v1, feeBasis: "flat", rateBps: null, flatFeeMinor: 1_500_000 }, tgEn, fEn))).toBe("CAD 15,000 flat");
    expect(plain(feeShort({ ...v1, feeBasis: "flat", rateBps: null, flatFeeMinor: 1_500_000 }, tgFr, fFr))).toBe("15 000 CAD (forfait)");
  });

  it("long form for the Placement fee row, with the currency code on flat amounts", () => {
    expect(feeLong(v1, tgEn, fEn)).toBe("20% of first-year base salary");
    expect(plain(feeLong({ ...v1, feeBasis: "flat", rateBps: null, flatFeeMinor: 1_500_000 }, tgEn, fEn))).toBe("CAD 15,000.00 flat fee");
  });

  it("names both the share and the fee rate when there's no frozen estimate (BR-36)", () => {
    expect(shareAtHire(4500, v1, tgEn, fEn)).toBe("45% of the fee (fee: 20% of the base salary at hire)");
    expect(shareAtHire(4500, { feeBasis: "pct_total_cash", rateBps: 1500 }, tgEn, fEn)).toBe("45% of the fee (fee: 15% of total cash at hire)");
  });
});

describe("changedRows (S5-e Changed badges)", () => {
  it("flags exactly the rows that differ", () => {
    expect([...changedRows(v1, { ...v1, versionNo: 2, guaranteeDays: 60 })]).toEqual(["guarantee"]);
    expect([...changedRows(v1, { ...v1, rateBps: 2200, ownershipMonths: 12 })].sort()).toEqual(["fee", "window"]);
    expect([...changedRows(v1, { ...v1, currency: "USD" })]).toEqual(["currency"]);
    expect(changedRows(null, v1).size).toBe(0);
  });
});

describe("shareFigure (S4)", () => {
  const base = { fee_basis: "pct_base" as const, rate_bps: 2000, flat_fee_minor: null, fee_currency: "CAD" };
  it("shows the estimate with a tilde, the exact flat share, or the basis without an amount", () => {
    expect(plain(shareFigure({ ...base, estimated_share_minor: 900_000 }, tgEn, fEn).text)).toBe("~CAD 9,000");
    const flat = shareFigure({ ...base, fee_basis: "flat", rate_bps: null, flat_fee_minor: 1_500_000, estimated_share_minor: 675_000 }, tgEn, fEn);
    expect(plain(flat.text)).toBe("CAD 6,750");
    expect(flat.label).toBe("Your share if hired");
    const hidden = shareFigure({ ...base, estimated_share_minor: null }, tgEn, fEn);
    expect(hidden).toEqual({ amount: null, text: "20% of base", label: "Fee" });
  });

  it("sorts jobs without an amount last, then by rate (AC-22)", () => {
    const rows = [
      { id: "a", estimated_share_minor: null, rate_bps: 2500, score: 90 },
      { id: "b", estimated_share_minor: 500_000, rate_bps: 1500, score: 50 },
      { id: "c", estimated_share_minor: null, rate_bps: 3000, score: 10 },
      { id: "d", estimated_share_minor: 900_000, rate_bps: null, score: 70 },
    ];
    expect(rows.sort(compareEarnings).map((r) => r.id)).toEqual(["d", "b", "c", "a"]);
  });
});

describe("owner nudge (BR-7)", () => {
  it("nudges only for missing terms, a non-permanent contract or a currency mismatch", () => {
    expect(hiddenReasonOf({ partner_visible: false, hidden_reason: "no_terms" })).toBe("no_terms");
    expect(hiddenReasonOf({ partner_visible: false, hidden_reason: "currency_mismatch" })).toBe("currency_mismatch");
    // N3 BR-1: the fourth reason, (d) no client name.
    expect(hiddenReasonOf({ partner_visible: false, hidden_reason: "no_client_name" })).toBe("no_client_name");
    expect(hiddenReasonOf({ partner_visible: false, hidden_reason: "not_open" })).toBeNull();
    expect(hiddenReasonOf({ partner_visible: false, hidden_reason: "not_active" })).toBeNull();
    expect(hiddenReasonOf({ partner_visible: true, hidden_reason: null })).toBeNull();
    expect(hiddenReasonOf(null)).toBeNull();
  });

  it("reads no version as no terms", () => {
    const empty = { terms_version_id: null, version_no: null, published_at: null, fee_basis: null, rate_bps: null, flat_fee_minor: null, min_fee_minor: null, currency: null, search_type: null, guarantee_days: null, guarantee_remedy: null, payment_terms_days: null, ownership_months: null };
    expect(termsFromState(empty)).toBeNull();
  });
});
