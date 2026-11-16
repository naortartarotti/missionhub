import { describe, expect, it } from "vitest";
import { createFormatter } from "../format";

describe("monthYear (N3 hire reports, approximate start)", () => {
  it("formats YYYY-MM and full dates without a day shift, per locale", () => {
    expect(createFormatter("en").monthYear("2027-03")).toBe("March 2027");
    expect(createFormatter("en").monthYear("2027-03-01")).toBe("March 2027");
    expect(createFormatter("fr").monthYear("2027-03")).toBe("mars 2027");
    expect(createFormatter("pt").monthYear("2027-01")).toBe("janeiro de 2027");
    expect(createFormatter("en").monthYear(null)).toBe("—");
  });
});
