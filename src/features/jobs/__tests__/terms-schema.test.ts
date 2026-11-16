import { describe, expect, it } from "vitest";
import { jobFormSchema } from "../schemas";

const job = {
  title: "Senior Engineer", clientName: "Northwind", workArrangement: "hybrid", contractType: "permanent",
  salaryMin: "90000", salaryMax: "110000", salaryCurrency: "CAD", status: "active",
};
const card = {
  acceptsExternalReferrals: "on", feeBasis: "pct_base", feeRate: "20", searchType: "contingent_shared",
  guaranteeDays: "90", guaranteeRemedy: "replacement_then_prorata", paymentTermsDays: "30", ownershipMonths: "6",
  directClientAttested: "on",
};
const fields = (r: ReturnType<typeof jobFormSchema.safeParse>) =>
  r.success ? [] : Object.keys((r.error.flatten().fieldErrors ?? {}) as Record<string, unknown>).sort();

describe("jobFormSchema terms card (BR-1, BR-6)", () => {
  it("a private job needs no card and any contract type", () => {
    const r = jobFormSchema.safeParse({ ...job, contractType: "contract" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.terms).toBeNull();
  });

  it("an open job with a complete % card → terms in database units, currency = salary currency", () => {
    const r = jobFormSchema.safeParse({ ...job, ...card, feeRate: "22.5", minimumFee: "15000" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.terms).toEqual({
      feeBasis: "pct_base", rateBps: 2250, flatFeeMinor: null, minFeeMinor: 1_500_000, currency: "CAD", searchType: "contingent_shared",
      guaranteeDays: 90, guaranteeRemedy: "replacement_then_prorata", paymentTermsDays: 30, ownershipMonths: 6,
    });
    expect(r.data.attested).toBe(true);
    expect("feeRate" in r.data).toBe(false);
  });

  it("flat: amount in the declared currency, no rate, no minimum", () => {
    const r = jobFormSchema.safeParse({ ...job, ...card, feeBasis: "flat", feeRate: "20", flatFee: "15000", flatCurrency: "usd" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.terms).toMatchObject({ feeBasis: "flat", rateBps: null, minFeeMinor: null, flatFeeMinor: 1_500_000, currency: "USD" });
  });

  it("refuses an open non-permanent job (whatever the status, drafts included)", () => {
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, contractType: "contract", status: "draft" }))).toEqual(["contractType"]);
  });

  it("refuses an incomplete or out-of-range card with field errors", () => {
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, feeRate: "" }))).toEqual(["feeRate"]);
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, feeRate: "51" }))).toEqual(["feeRate"]);
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, feeBasis: "flat", flatFee: "", flatCurrency: "CAD" }))).toEqual(["flatFee"]);
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, feeBasis: "flat", flatFee: "100", flatCurrency: "JPY" }))).toEqual(["flatCurrency"]);
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, minimumFee: "0" }))).toEqual(["minimumFee"]);
    // QA-N2-07: above 10^12 minor units (CAD 10,000,000,000.00) is refused.
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, minimumFee: "10000000000.01" }))).toEqual(["minimumFee"]);
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, feeBasis: "flat", flatFee: "10000000000.01", flatCurrency: "CAD" }))).toEqual(["flatFee"]);
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, guaranteeDays: "45" }))).toEqual(["guaranteeDays"]);
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, guaranteeRemedy: "" }))).toEqual(["guaranteeRemedy"]);
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, paymentTermsDays: "91" }))).toEqual(["paymentTermsDays"]);
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, ownershipMonths: "5" }))).toEqual(["ownershipMonths"]);
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, searchType: "rpo" }))).toEqual(["searchType"]);
  });

  it("no guarantee → no remedy; a posted remedy or a flat minimum is refused (AC-3, AC-5)", () => {
    const r = jobFormSchema.safeParse({ ...job, ...card, guaranteeDays: "0", guaranteeRemedy: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.terms).toMatchObject({ guaranteeDays: 0, guaranteeRemedy: null });
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, guaranteeDays: "0", guaranteeRemedy: "full_refund" }))).toEqual(["guaranteeRemedy"]);
    expect(fields(jobFormSchema.safeParse({ ...job, ...card, feeBasis: "flat", flatFee: "100", flatCurrency: "CAD", minimumFee: "5" }))).toEqual(["minimumFee"]);
  });

  it("the retired fee fields are ignored (BR-9)", () => {
    const r = jobFormSchema.safeParse({ ...job, expectedFee: "20000", feeCurrency: "CAD", shareFee: "on" });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data)).not.toEqual(expect.arrayContaining(["expectedFee", "shareFee"]));
  });
});
