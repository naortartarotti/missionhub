import { describe, expect, it } from "vitest";
import { isUuid, referralIdFrom } from "../referral-lookup";

const ID = "9b97b264-a80b-4f92-9f2d-930484235993";

describe("admin referral lookup (S10)", () => {
  it("reads the id from a pasted referral link or a bare id", () => {
    expect(referralIdFrom(`https://app.example/workspace/acme/referrals/${ID}?submitted=1`)).toBe(ID);
    expect(referralIdFrom(`  ${ID.toUpperCase()} `)).toBe(ID);
  });
  it("returns null when there's no id", () => {
    expect(referralIdFrom("https://example.test/nothing")).toBeNull();
    expect(referralIdFrom("")).toBeNull();
  });
  it("validates route params", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("not-an-id")).toBe(false);
  });
});
