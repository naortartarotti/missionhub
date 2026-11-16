import { describe, expect, it } from "vitest";
import { bpsToRateInput, estimateFee, parseRateToBps, termsDiffer, type TermsValues } from "../terms";

describe("parseRateToBps (T2, BR-1: 1–50 %, two decimals)", () => {
  it.each([
    ["20", 2000], ["22.5", 2250], ["22.50", 2250], ["1", 100], ["50", 5000], ["0.5", null], ["50.01", null],
    ["", null], ["abc", null], ["20.123", null], ["-5", null], ["12,5", 1250], [" 15 ", 1500],
  ])("%s → %s", (input, bps) => expect(parseRateToBps(input)).toBe(bps));

  it("round-trips through the form value", () => {
    for (const bps of [100, 1250, 2000, 2250, 5000]) expect(parseRateToBps(bpsToRateInput(bps))).toBe(bps);
    expect(bpsToRateInput(2250)).toBe("22.5");
    expect(bpsToRateInput(null)).toBe("");
  });
});

describe("estimateFee (mirror of app.terms_estimate, BR-9 / BR-11)", () => {
  const pct = { feeBasis: "pct_base" as const, rateBps: 2000, flatFeeMinor: null, minFeeMinor: null };
  const band = { shareSalary: true, salaryMin: 9_000_000, salaryMax: 11_000_000 };

  it("flat → the flat amount, whatever the salary visibility", () => {
    expect(estimateFee({ feeBasis: "flat", rateBps: null, flatFeeMinor: 1_500_000, minFeeMinor: null }, { ...band, shareSalary: false })).toBe(1_500_000);
  });

  it("% → rate × band midpoint, only when the band is shared", () => {
    expect(estimateFee(pct, band)).toBe(2_000_000);
    expect(estimateFee(pct, { ...band, shareSalary: false })).toBeNull();
    expect(estimateFee(pct, { shareSalary: true, salaryMin: null, salaryMax: null })).toBeNull();
  });

  it("uses the single bound when only one is set", () => {
    expect(estimateFee(pct, { shareSalary: true, salaryMin: 10_000_000, salaryMax: null })).toBe(2_000_000);
    expect(estimateFee(pct, { shareSalary: true, salaryMin: null, salaryMax: 5_000_000 })).toBe(1_000_000);
  });

  it("rounds half up in minor units", () => {
    // (1 + 2) × 2250 / 20000 = 0.3375 → 0 → no estimate (QA-N2-09) ; (3 + 4) × 2250 / 20000 = 0.7875 → 1 ; 5 × 2 × 1000 / 20000 = 0.5 → 1
    expect(estimateFee({ ...pct, rateBps: 2250 }, { shareSalary: true, salaryMin: 1, salaryMax: 2 })).toBeNull();
    expect(estimateFee({ ...pct, rateBps: 2250 }, { shareSalary: true, salaryMin: 3, salaryMax: 4 })).toBe(1);
    expect(estimateFee({ ...pct, rateBps: 1000 }, { shareSalary: true, salaryMin: 5, salaryMax: 5 })).toBe(1);
  });

  it("a zero estimate is no estimate (QA-N2-09)", () => {
    expect(estimateFee(pct, { shareSalary: true, salaryMin: 0, salaryMax: 0 })).toBeNull();
    expect(estimateFee(pct, { shareSalary: true, salaryMin: 0, salaryMax: null })).toBeNull();
    expect(estimateFee(pct, { shareSalary: true, salaryMin: 1, salaryMax: 2 })).toBeNull(); // rounds to 0
  });

  it("fails closed outside [0, 10^12] (QA-N2-07)", () => {
    expect(estimateFee({ feeBasis: "flat", rateBps: null, flatFeeMinor: 1_000_000_000_001, minFeeMinor: null }, band)).toBeNull();
    expect(estimateFee(pct, { shareSalary: true, salaryMin: 9_000_000_000_000_000, salaryMax: 9_000_000_000_000_000 })).toBeNull();
    expect(estimateFee({ feeBasis: "flat", rateBps: null, flatFeeMinor: 1_000_000_000_000, minFeeMinor: null }, band)).toBe(1_000_000_000_000);
  });

  it("is at least the minimum fee", () => {
    expect(estimateFee({ ...pct, minFeeMinor: 2_500_000 }, band)).toBe(2_500_000);
    expect(estimateFee({ ...pct, minFeeMinor: 100 }, band)).toBe(2_000_000);
  });
});

describe("termsDiffer (BR-5)", () => {
  const base: TermsValues = {
    feeBasis: "pct_base", rateBps: 2000, flatFeeMinor: null, minFeeMinor: null, currency: "CAD", searchType: "contingent_shared",
    guaranteeDays: 90, guaranteeRemedy: "replacement_then_prorata", paymentTermsDays: 30, ownershipMonths: 6,
  };
  it("no current version → a version is published", () => expect(termsDiffer(null, base)).toBe(true));
  it("identical → no version", () => expect(termsDiffer({ ...base }, base)).toBe(false));
  it.each(Object.entries({ rateBps: 2100, currency: "USD", ownershipMonths: 12, guaranteeDays: 0, searchType: "retained", minFeeMinor: 1 }))(
    "%s changed → version",
    (k, val) => expect(termsDiffer(base, { ...base, [k]: val } as TermsValues)).toBe(true),
  );
});
