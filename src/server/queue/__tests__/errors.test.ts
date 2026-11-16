import { describe, expect, it } from "vitest";
import { describeError } from "../errors";

describe("describeError (worker logging, QA-PRE-01)", () => {
  it("reads message and code from a PostgREST error object, never details or hint", () => {
    const r = describeError({ message: "URI too long\n", code: "PGRST000", details: "candidate a@b.c", hint: "row 42" });
    expect(r).toEqual({ message: "URI too long", code: "PGRST000" });
    expect(JSON.stringify(r)).not.toMatch(/a@b\.c|row 42/);
  });
  it("handles Error instances and primitives", () => {
    expect(describeError(new Error("boom"))).toEqual({ message: "boom", code: null });
    expect(describeError("plain")).toEqual({ message: "plain", code: null });
    expect(describeError({})).toEqual({ message: "Unknown error", code: null });
  });
  it("truncates long messages", () => expect(describeError({ message: "x".repeat(900) }).message).toHaveLength(500));
});
