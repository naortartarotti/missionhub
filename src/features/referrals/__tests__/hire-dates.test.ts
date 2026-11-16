import { describe, expect, it } from "vitest";
import { hireDateBounds, todayEt, validateHireDates } from "../hire-dates";

const MSG = "out of range";
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("hire date bounds (N3 PD-077, AC-16)", () => {
  // Delivered 2026-03-10 12:00 UTC (08:00 ET); today 2026-11-16 (ET).
  const b = hireDateBounds("2026-03-10T12:00:00Z", "2026-11-16");

  it("spans delivery − 366 days to today + 548 days, in ET calendar dates", () => {
    expect(b).toEqual({ min: "2025-03-09", max: "2028-05-17", today: "2026-11-16" });
  });

  it("uses the ET date of the delivery instant", () => {
    // 03:00 UTC on Mar 10 is still Mar 9 in Toronto.
    expect(hireDateBounds("2026-03-10T03:00:00Z", "2026-11-16").min).toBe("2025-03-08");
  });

  it("has no floor without a delivery", () => {
    expect(hireDateBounds(null, "2026-11-16").min).toBeNull();
  });

  it("requires a start date inside the range", () => {
    expect(validateHireDates(fd({}), b, MSG)).toEqual({ startDate: [MSG] });
    expect(validateHireDates(fd({ startDate: "2028-05-18" }), b, MSG)).toEqual({ startDate: [MSG] });
    expect(validateHireDates(fd({ startDate: "2025-03-08" }), b, MSG)).toEqual({ startDate: [MSG] });
    expect(validateHireDates(fd({ startDate: "2028-05-17" }), b, MSG)).toBeNull();
    // A future start date is fine (notice periods).
    expect(validateHireDates(fd({ startDate: "2027-01-04" }), b, MSG)).toBeNull();
  });

  it("checks the acceptance date only when given and not unknown", () => {
    expect(validateHireDates(fd({ startDate: "2026-12-01", offerAcceptedOn: "2024-01-01" }), b, MSG)).toEqual({ offerAcceptedOn: [MSG] });
    expect(validateHireDates(fd({ startDate: "2026-12-01", offerAcceptedOn: "2024-01-01", acceptanceUnknown: "on" }), b, MSG)).toBeNull();
    expect(validateHireDates(fd({ startDate: "2026-12-01", offerAcceptedOn: "" }), b, MSG)).toBeNull();
  });

  it("formats today in Toronto", () => {
    expect(todayEt(new Date("2026-11-17T03:30:00Z"))).toBe("2026-11-16");
  });
});
