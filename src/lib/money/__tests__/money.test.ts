import { describe, expect, it } from "vitest";
import { allocateMinor, splitCommission, DEFAULT_SPLIT } from "../allocate";
import { formatMoney, parseMajorToMinor } from "../format";

describe("allocateMinor", () => {
  it("splits CAD 20,000 into 9,000 / 9,000 / 2,000", () => {
    const r = splitCommission(2_000_000, DEFAULT_SPLIT);
    expect(r).toEqual({ sourcing: 900_000n, jobOwner: 900_000n, platform: 200_000n });
  });

  it("always reconciles exactly to the distributable amount", () => {
    for (const amount of [1, 2, 3, 7, 99, 1001, 123_457, 999_999_999]) {
      const parts = allocateMinor(amount, [4500, 4500, 1000]);
      expect(parts.reduce((a, b) => a + b, 0n)).toBe(BigInt(amount));
    }
  });

  it("is deterministic with ties going to the earlier share", () => {
    expect(allocateMinor(1001, [4500, 4500, 1000])).toEqual([451n, 450n, 100n]);
    expect(allocateMinor(1, [3333, 3333, 3334])).toEqual([0n, 0n, 1n]);
  });

  it("reverses symmetrically for refunds", () => {
    expect(allocateMinor(-1001, [4500, 4500, 1000])).toEqual([-451n, -450n, -100n]);
  });

  it("supports custom versioned splits", () => {
    expect(allocateMinor(1_000_000, [5000, 4000, 1000])).toEqual([500_000n, 400_000n, 100_000n]);
  });

  it("rejects splits that do not total 100%", () => {
    expect(() => allocateMinor(100, [4500, 4500, 900])).toThrow(/10000/);
    expect(() => allocateMinor(100, [-1, 10001])).toThrow();
  });
});

describe("money formatting", () => {
  it("parses major units to minor without float drift", () => {
    expect(parseMajorToMinor("20,000", "CAD")).toBe(2_000_000);
    expect(parseMajorToMinor("0.29", "CAD")).toBe(29);
    expect(parseMajorToMinor("1.005", "CAD")).toBeNull();
    expect(parseMajorToMinor("1500", "JPY")).toBe(1500);
    expect(parseMajorToMinor("abc", "CAD")).toBeNull();
  });

  it("formats with currency exponent", () => {
    expect(formatMoney(2_000_000, "CAD", "en-CA")).toBe("$20,000.00");
    expect(formatMoney(1500, "JPY", "en-CA")).toContain("1,500");
  });
});
