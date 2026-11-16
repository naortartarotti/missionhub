import { describe, expect, it } from "vitest";
import { priorDateRange } from "../components/claim-dialog";

describe("claim look-back bound (BR-20)", () => {
  it("defaults to 6 months for legacy referrals, end-of-month clamped in ET", () => {
    // Delivered Aug 31 (ET) → Feb 28.
    expect(priorDateRange("2026-08-31T16:00:00Z")).toEqual({ min: "2026-02-28", max: "2026-08-30", delivered: "2026-08-31" });
  });

  it("follows the referral's window", () => {
    expect(priorDateRange("2026-11-15T16:00:00Z", 12).min).toBe("2025-11-15");
    expect(priorDateRange("2026-11-15T16:00:00Z", 8).min).toBe("2026-03-15");
  });

  it("prefers the server's bound when it sent one", () => {
    expect(priorDateRange("2026-11-15T16:00:00Z", 12, "2025-11-14").min).toBe("2025-11-14");
    expect(priorDateRange("2026-11-15T16:00:00Z", 12, "garbage").min).toBe("2025-11-15");
  });
});
