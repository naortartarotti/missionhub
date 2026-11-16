import { describe, expect, it } from "vitest";
import { createFormatter } from "../format";

// Intl uses non-breaking (and narrow non-breaking) spaces; compare on plain spaces.
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("f.money currency-code display (BR-38)", () => {
  it("shows the ISO code in every locale", () => {
    expect(plain(createFormatter("en").money(2_000_000, "CAD", { code: true }))).toBe("CAD 20,000.00");
    expect(plain(createFormatter("fr").money(2_000_000, "CAD", { code: true }))).toBe("20 000,00 CAD");
    expect(plain(createFormatter("pt").money(2_000_000, "CAD", { code: true }))).toBe("CAD 20.000,00");
  });

  it("marks estimates with a tilde and can drop minor units", () => {
    expect(plain(createFormatter("en").money(2_000_000, "CAD", { code: true, whole: true, approx: true }))).toBe("~CAD 20,000");
    expect(plain(createFormatter("fr").money(2_000_000, "CAD", { code: true, whole: true, approx: true }))).toBe("~20 000 CAD");
  });

  it("keeps the sign on negative amounts and follows the currency's exponent", () => {
    expect(plain(createFormatter("en").money(-180_000, "CAD", { code: true }))).toBe("-CAD 1,800.00");
    expect(plain(createFormatter("en").money(1500, "JPY", { code: true }))).toBe("JPY 1,500");
  });

  it("leaves the symbol display unchanged without the option", () => {
    expect(createFormatter("en").money(2_000_000, "CAD", { whole: true })).toBe("$20,000");
    expect(createFormatter("en").money(null, "CAD", { code: true })).toBe("—");
  });
});

describe("f.percent", () => {
  it("formats basis points with up to 2 decimals and no trailing zeros", () => {
    expect(createFormatter("en").percent(2000)).toBe("20%");
    expect(createFormatter("en").percent(2250)).toBe("22.5%");
    expect(createFormatter("en").percent(2255)).toBe("22.55%");
    expect(plain(createFormatter("fr").percent(2250))).toBe("22,5 %");
    expect(createFormatter("pt").percent(4500)).toBe("45%");
  });
});

describe("f.money signed differences", () => {
  it("shows the sign on both sides of zero", () => {
    expect(plain(createFormatter("en").money(-1_200_000, "CAD", { code: true, signed: true }))).toBe("-CAD 12,000.00");
    expect(plain(createFormatter("en").money(500_000, "CAD", { code: true, signed: true }))).toBe("+CAD 5,000.00");
  });
});
