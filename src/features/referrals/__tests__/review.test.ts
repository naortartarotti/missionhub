import { describe, expect, it } from "vitest";
import { CLOSED_STATUSES, DECLINE_REASONS, isDeclineReason } from "../review";

describe("decline reasons (N1, BR-11, BR-30)", () => {
  it("doesn't offer duplicate or prior_presentation as a manual reason", () => {
    expect(DECLINE_REASONS).not.toContain("duplicate");
    expect(DECLINE_REASONS).not.toContain("prior_presentation");
  });

  it("still labels legacy duplicate declines", () => {
    expect(isDeclineReason("duplicate")).toBe(true);
    expect(isDeclineReason("nonsense")).toBe(false);
  });

  it("treats already_presented as closed", () => {
    expect(CLOSED_STATUSES.has("already_presented")).toBe(true);
  });
});
