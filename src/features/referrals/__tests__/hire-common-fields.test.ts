import { describe, expect, it } from "vitest";
import { hireCommonFields } from "../schemas";

const base = { startDate: "2026-11-20", offerAcceptedOn: null as string | null, acceptanceUnknown: false, role: "this_job" as const, otherRoleTitle: null as string | null };
const keys = (r: ReturnType<typeof hireCommonFields>) => Object.keys(r.fieldErrors).sort();

describe("N3 BR-8 record-hire common fields (AC-16, AC-17)", () => {
  it("acceptance date: not in the future and not after the start date; unknown clears it", () => {
    expect(keys(hireCommonFields({ ...base, offerAcceptedOn: "2026-11-17" }, "2026-11-16"))).toEqual(["offerAcceptedOn"]);
    expect(hireCommonFields({ ...base, offerAcceptedOn: "2026-11-17" }, "2026-11-16").fieldErrors.offerAcceptedOn?.[0]).toMatch(/acceptanceFuture$/);
    expect(hireCommonFields({ ...base, startDate: "2026-11-10", offerAcceptedOn: "2026-11-12" }, "2026-11-16").fieldErrors.offerAcceptedOn?.[0]).toMatch(/acceptanceAfterStart$/);
    const ok = hireCommonFields({ ...base, offerAcceptedOn: "2026-11-12" }, "2026-11-16");
    expect(ok).toEqual({ fieldErrors: {}, offerAcceptedOn: "2026-11-12", hiredRoleTitle: null });
    expect(hireCommonFields({ ...base, offerAcceptedOn: "2026-12-30", acceptanceUnknown: true }, "2026-11-16")).toEqual({ fieldErrors: {}, offerAcceptedOn: null, hiredRoleTitle: null });
  });

  it("another role needs a title of 1–120 characters; 'this job' ignores a posted title", () => {
    expect(keys(hireCommonFields({ ...base, role: "other" }, "2026-11-16"))).toEqual(["otherRoleTitle"]);
    expect(keys(hireCommonFields({ ...base, role: "other", otherRoleTitle: "x".repeat(121) }, "2026-11-16"))).toEqual(["otherRoleTitle"]);
    expect(hireCommonFields({ ...base, role: "other", otherRoleTitle: "Senior Analyst" }, "2026-11-16").hiredRoleTitle).toBe("Senior Analyst");
    expect(hireCommonFields({ ...base, otherRoleTitle: "Ignored" }, "2026-11-16").hiredRoleTitle).toBeNull();
  });
});

describe("N3 v2 hireDateWindow (PD-077)", () => {
  it("is [delivery ET date − 1 year, today + 548 days]; Feb 29 maps to Feb 28", async () => {
    const { hireDateWindow } = await import("../schemas");
    expect(hireDateWindow("2026-11-16T15:00:00Z", "2026-11-16")).toEqual({ min: "2025-11-16", max: "2028-05-17" });
    // 03:00 UTC on Nov 17 is still Nov 16 in Toronto.
    expect(hireDateWindow("2026-11-17T03:00:00Z", "2026-11-17").min).toBe("2025-11-16");
    expect(hireDateWindow("2028-02-29T15:00:00Z", "2028-03-01").min).toBe("2027-02-28");
  });
});
