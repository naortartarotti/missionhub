import { describe, expect, it } from "vitest";
import { allocatePlacement, splitCommission } from "../allocate";
import { computeFee } from "../terms";

const SPLIT = { sourcingBps: 4500, jobOwnerBps: 4500, platformBps: 1000 };
const n = (r: { sourcing: bigint; jobOwner: bigint; platform: bigint }) => [Number(r.sourcing), Number(r.jobOwner), Number(r.platform)];

describe("allocatePlacement (BR-27; worked examples from backend-estimate §5)", () => {
  it("E1: I ≥ C → exactly today's split, both bases", () => {
    for (const platformBasis of ["collected", "frozen"] as const) {
      expect(n(allocatePlacement(2_200_000, SPLIT, { computedMinor: 2_000_000, invoicedMinor: 2_200_000, platformBasis }))).toEqual([990_000, 990_000, 220_000]);
    }
  });

  it("legacy (no C) → today's allocateMinor, including its remainder rule", () => {
    expect(allocatePlacement(1_000_001, SPLIT, { computedMinor: null, invoicedMinor: 1_000_001, platformBasis: "collected" })).toEqual(splitCommission(1_000_001, SPLIT));
  });

  it("E2: I < C, full payment", () => {
    expect(n(allocatePlacement(1_600_000, SPLIT, { computedMinor: 2_000_000, invoicedMinor: 1_600_000, platformBasis: "collected" }))).toEqual([900_000, 540_000, 160_000]);
    expect(n(allocatePlacement(1_600_000, SPLIT, { computedMinor: 2_000_000, invoicedMinor: 1_600_000, platformBasis: "frozen" }))).toEqual([900_000, 500_000, 200_000]);
  });

  it("E3: partial payment scales by P / I", () => {
    expect(n(allocatePlacement(800_000, SPLIT, { computedMinor: 2_000_000, invoicedMinor: 1_600_000, platformBasis: "collected" }))).toEqual([450_000, 270_000, 80_000]);
    expect(n(allocatePlacement(800_000, SPLIT, { computedMinor: 2_000_000, invoicedMinor: 1_600_000, platformBasis: "frozen" }))).toEqual([450_000, 250_000, 100_000]);
  });

  it("E4: half-up rounding, job owner takes the remainder", () => {
    expect(n(allocatePlacement(333_333, SPLIT, { computedMinor: 1_234_567, invoicedMinor: 1_000_000, platformBasis: "collected" }))).toEqual([185_185, 114_815, 33_333]);
    expect(n(allocatePlacement(333_333, SPLIT, { computedMinor: 1_234_567, invoicedMinor: 1_000_000, platformBasis: "frozen" }))).toEqual([185_185, 106_996, 41_152]);
  });

  it("E5: deep discount → negative job-owner share", () => {
    expect(n(allocatePlacement(200_000, SPLIT, { computedMinor: 2_000_000, invoicedMinor: 200_000, platformBasis: "collected" }))).toEqual([900_000, -720_000, 20_000]);
  });

  it("E6: a full refund reverses a payment exactly", () => {
    const fee = { computedMinor: 1_234_567, invoicedMinor: 1_000_000, platformBasis: "collected" as const };
    const pay = n(allocatePlacement(333_333, SPLIT, fee));
    expect(n(allocatePlacement(-333_333, SPLIT, fee))).toEqual(pay.map((x) => -x));
  });

  it("parts always sum to P at the 10^12 bound (intermediate products beyond 2^53 stay exact)", () => {
    const big = 1_000_000_000_000n;
    const r = allocatePlacement(big, SPLIT, { computedMinor: big * 2n, invoicedMinor: big, platformBasis: "frozen" });
    expect(r.sourcing + r.jobOwner + r.platform).toBe(big);
    expect(r.sourcing).toBe(big * 9n / 10n);
  });

  it("refuses |P| above 10^12 on every path (QA-N2-08)", () => {
    const fee = { computedMinor: 1000, invoicedMinor: 1000, platformBasis: "collected" as const };
    expect(() => allocatePlacement(1_000_000_000_001n, SPLIT, fee)).toThrow(/invalid_fee/);
    expect(() => allocatePlacement(-1_000_000_000_001n, SPLIT, { ...fee, computedMinor: null })).toThrow(/invalid_fee/);
  });
});

describe("computeFee (BR-22, mirror of app.compute_fee)", () => {
  const pct = { feeBasis: "pct_base" as const, rateBps: 2000, flatFeeMinor: null, minFeeMinor: null };
  it("% of base", () => expect(computeFee(pct, { baseMinor: 10_000_000 })).toBe(2_000_000));
  it("total cash adds the target bonus", () => expect(computeFee({ ...pct, feeBasis: "pct_total_cash" }, { baseMinor: 10_000_000, bonusMinor: 1_500_000 })).toBe(2_300_000));
  it("minimum fee binds", () => expect(computeFee({ ...pct, minFeeMinor: 2_500_000 }, { baseMinor: 10_000_000 })).toBe(2_500_000));
  it("half-up", () => {
    expect(computeFee({ ...pct, rateBps: 2250 }, { baseMinor: 2 })).toBe(0); // 0.45
    expect(computeFee({ ...pct, rateBps: 2500 }, { baseMinor: 2 })).toBe(1); // 0.5
  });
  it("flat ignores the base", () => expect(computeFee({ feeBasis: "flat", rateBps: null, flatFeeMinor: 1_500_000, minFeeMinor: null }, { baseMinor: null })).toBe(1_500_000));
  it("missing base → null", () => expect(computeFee(pct, { baseMinor: null })).toBeNull());
});
