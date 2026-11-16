import { describe, expect, it } from "vitest";
import { jobFormSchema } from "../schemas";

/**
 * QA (N2 step 6): the exact boundary values of spec §7 AC-2 to AC-6 against the shared job form schema.
 * `it.fails` marks a spec deviation reported in docs/specs/job-terms-card/qa-report.md: it passes while the
 * bug exists and starts failing once it's fixed (then drop `.fails`).
 */
const job = {
  title: "Senior Engineer", clientName: "Northwind", workArrangement: "hybrid", contractType: "permanent",
  salaryMin: "90000", salaryMax: "110000", salaryCurrency: "CAD", status: "active",
};
const card = {
  acceptsExternalReferrals: "on", feeBasis: "pct_base", feeRate: "20", searchType: "contingent_shared",
  guaranteeDays: "90", guaranteeRemedy: "replacement_then_prorata", paymentTermsDays: "30", ownershipMonths: "6",
  directClientAttested: "on",
};
const parse = (over: Record<string, unknown>) => jobFormSchema.safeParse({ ...job, ...card, ...over });
const errorsOn = (over: Record<string, unknown>) => {
  const r = parse(over);
  return r.success ? [] : Object.keys((r.error.flatten().fieldErrors ?? {}) as Record<string, unknown>).sort();
};

describe("AC-2 (T2) rate and flat amount", () => {
  it.each(["0.99", "50.01", "22.555", ""])("rate %j is refused on feeRate", (feeRate) => expect(errorsOn({ feeRate })).toEqual(["feeRate"]));
  it.each([["1", 100], ["50", 5000], ["22.5", 2250], ["22.55", 2255]])("rate %j is accepted (%i bps)", (feeRate, bps) => {
    const r = parse({ feeRate });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.terms?.rateBps).toBe(bps);
  });
  it.each(["0", ""])("flat amount %j is refused", (flatFee) => expect(errorsOn({ feeBasis: "flat", feeRate: "", flatFee, flatCurrency: "CAD" })).toEqual(["flatFee"]));
  it("flat 15000 is accepted", () => {
    const r = parse({ feeBasis: "flat", feeRate: "", flatFee: "15000", flatCurrency: "CAD" });
    expect(r.success && r.data.terms?.flatFeeMinor).toBe(1_500_000);
  });
});

describe("AC-3 (T3) minimum fee", () => {
  it("a minimum of 0 is refused; empty means none", () => {
    expect(errorsOn({ minimumFee: "0" })).toEqual(["minimumFee"]);
    const r = parse({ minimumFee: "" });
    expect(r.success && r.data.terms?.minFeeMinor).toBeNull();
  });
  // QA-N2-03 (fixed): a forged minimum on a flat basis is refused.
  it("a forged minimum on a flat basis is refused (spec AC-3)", () => {
    expect(parse({ feeBasis: "flat", feeRate: "", flatFee: "15000", flatCurrency: "CAD", minimumFee: "5000" }).success).toBe(false);
  });
});

describe("AC-4 (T4) currency", () => {
  it.each(["CAD", "USD", "EUR", "GBP", "BRL"])("flat %s is accepted", (flatCurrency) => expect(parse({ feeBasis: "flat", feeRate: "", flatFee: "100", flatCurrency }).success).toBe(true));
  it.each(["JPY", "XXX", "cadx", ""])("forged flat currency %j is refused", (flatCurrency) =>
    expect(errorsOn({ feeBasis: "flat", feeRate: "", flatFee: "100", flatCurrency })).toEqual(["flatCurrency"]));
  it("% bases take the salary currency, whatever flatCurrency says", () => {
    const r = parse({ salaryCurrency: "BRL", flatCurrency: "USD" });
    expect(r.success && r.data.terms?.currency).toBe("BRL");
  });
});

describe("AC-5 (T7) guarantee", () => {
  it.each(["45", "365", "-30", "abc"])("forged length %j is refused", (guaranteeDays) => expect(errorsOn({ guaranteeDays })).toEqual(["guaranteeDays"]));
  it.each(["30", "60", "120", "180"])("length %s requires a remedy", (guaranteeDays) => expect(errorsOn({ guaranteeDays, guaranteeRemedy: "" })).toEqual(["guaranteeRemedy"]));
  it("None stores no remedy", () => {
    const r = parse({ guaranteeDays: "0", guaranteeRemedy: "" });
    expect(r.success && r.data.terms?.guaranteeRemedy).toBeNull();
  });
  // QA-N2-03 (fixed): a forged remedy with None is refused.
  it("a remedy with None is refused (spec AC-5)", () => {
    expect(parse({ guaranteeDays: "0", guaranteeRemedy: "full_refund" }).success).toBe(false);
  });
});

describe("AC-6 (T8, T9) payment terms and window", () => {
  it.each(["-1", "91", "30.5"])("payment days %j are refused", (paymentTermsDays) => expect(errorsOn({ paymentTermsDays })).toEqual(["paymentTermsDays"]));
  it.each([["0", 0], ["90", 90]])("payment days %j are accepted", (paymentTermsDays, n) => {
    const r = parse({ paymentTermsDays });
    expect(r.success && r.data.terms?.paymentTermsDays).toBe(n);
  });
  it.each(["5", "13", "6.5"])("window %j is refused", (ownershipMonths) => expect(errorsOn({ ownershipMonths })).toEqual(["ownershipMonths"]));
  it.each(["6", "12"])("window %s is accepted", (ownershipMonths) => expect(parse({ ownershipMonths }).success).toBe(true));
});

describe("AC-10 (BR-6) opening needs a complete card and permanent, drafts included", () => {
  it.each(["contract", "temporary", "contract_to_hire"])("open + %s is refused on contractType", (contractType) =>
    expect(errorsOn({ contractType, status: "draft" })).toContain("contractType"));
  it("open with no card fields at all is refused", () => {
    const r = jobFormSchema.safeParse({ ...job, acceptsExternalReferrals: "on", status: "draft" });
    expect(r.success).toBe(false);
  });
  it("a private contract job with no card saves", () => expect(jobFormSchema.safeParse({ ...job, contractType: "contract", status: "draft" }).success).toBe(true));
});
