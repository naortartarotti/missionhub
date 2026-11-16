import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/referrals/queries", () => ({ getReferralTerms: vi.fn() }));
vi.mock("@/server/auth/context", () => ({ assertCan: vi.fn() }));

const { feePendingEstimate, isInvoiceOverdue } = await import("../placement-signals");

const t = ((k: string, p?: Record<string, unknown>) => `${k}${p ? JSON.stringify(p) : ""}`) as never;
const f = { money: (v: number, c: string) => `${c} ${v}`, percent: (bps: number) => `${bps / 100}%` } as never;
const recorded = (over: Record<string, unknown>, feeEstimateMinor: number | null) =>
  ({ recorded: true, feeEstimateMinor, effective: { fee_basis: "pct_base", rate_bps: 2000, flat_fee_minor: null, currency: "CAD", ...over } }) as never;

describe("fee-pending estimate line (N3 BR-31, AC-68)", () => {
  it("shows no estimate on a legacy referral", () => {
    expect(feePendingEstimate({ recorded: false } as never, t, f)).toEqual({ text: "feePending.legacy", legacy: true });
    expect(feePendingEstimate(null, t, f).legacy).toBe(true);
  });
  it("shows the fixed fee on flat terms", () => {
    expect(feePendingEstimate(recorded({ fee_basis: "flat", flat_fee_minor: 1500000, rate_bps: null }, null), t, f).text).toBe('feePending.flat{"amount":"CAD 1500000"}');
  });
  it("shows the frozen estimate when one exists, else the rate", () => {
    expect(feePendingEstimate(recorded({}, 2400000), t, f).text).toBe('feePending.estimate{"amount":"CAD 2400000"}');
    expect(feePendingEstimate(recorded({}, null), t, f).text).toBe('feePending.rateOnly{"rate":"20%"}');
  });
});

describe("invoice overdue (N3 BR-14, AC-30)", () => {
  const now = new Date("2026-11-16T12:00:00Z").getTime();
  it("is overdue after invoice_due_at with no invoice", () => {
    expect(isInvoiceOverdue({ invoice_due_at: "2026-11-15T05:00:00Z", invoiceCount: 0 }, now)).toBe(true);
  });
  it("isn't overdue before the date, once invoiced, or without a clock", () => {
    expect(isInvoiceOverdue({ invoice_due_at: "2026-11-17T05:00:00Z", invoiceCount: 0 }, now)).toBe(false);
    expect(isInvoiceOverdue({ invoice_due_at: "2026-11-15T05:00:00Z", invoiceCount: 1 }, now)).toBe(false);
    expect(isInvoiceOverdue({ invoice_due_at: null, invoiceCount: 0 }, now)).toBe(false);
  });
});
