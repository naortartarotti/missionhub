import { describe, expect, it } from "vitest";
import { expectedShare, type FeeTerms } from "../terms";

const rule = { sourcing_bps: 4500, job_owner_bps: 4500, platform_bps: 1000 };
const pct: FeeTerms = { fee_basis: "pct_base", rate_bps: 2000, flat_fee_minor: null, min_fee_minor: null, currency: "CAD" };
const flat: FeeTerms = { fee_basis: "flat", rate_bps: null, flat_fee_minor: 1_500_000, min_fee_minor: null, currency: "CAD" };

describe("expectedShare (BR-36, QA-N2-05)", () => {
  it("no amendment: frozen estimate × sourcing share; null without an estimate", () => {
    expect(expectedShare(pct, pct, 2_000_000, rule)).toBe(900_000);
    expect(expectedShare(pct, pct, null, rule)).toBeNull();
  });
  it("an amendment that keeps the fee terms keeps the frozen estimate", () => {
    expect(expectedShare(pct, { ...pct }, 2_000_000, rule)).toBe(900_000);
  });
  it("an amended rate, minimum or basis drops the frozen estimate → null (UI shows shareAtHire)", () => {
    expect(expectedShare(pct, { ...pct, rate_bps: 1500 }, 2_000_000, rule)).toBeNull();
    expect(expectedShare(pct, { ...pct, min_fee_minor: 1 }, 2_000_000, rule)).toBeNull();
    expect(expectedShare(pct, { ...pct, fee_basis: "pct_total_cash" }, 2_000_000, rule)).toBeNull();
    expect(expectedShare(flat, pct, 1_500_000, rule)).toBeNull();
  });
  it("effective flat → exact share of the effective flat amount", () => {
    expect(expectedShare(pct, flat, 2_000_000, rule)).toBe(675_000);
    expect(expectedShare(flat, { ...flat, flat_fee_minor: 1_000_000 }, 1_500_000, rule)).toBe(450_000);
  });
});
