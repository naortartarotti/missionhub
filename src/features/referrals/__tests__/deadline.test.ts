import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en";
import fr from "@/i18n/messages/fr";
import pt from "@/i18n/messages/pt";
import { createFormatter } from "@/i18n/format";
import { createTranslator } from "@/i18n/translate";
import { deadlineLine, deadlineState } from "../deadline";

// QA (N1, AC-28, S5-x): deadlines are shown in Toronto time with the server's business days left,
// whatever the viewer's zone. 2026-11-20 23:59:59 ET = 2026-11-21T04:59:59Z.
const DEADLINE = "2026-11-21T04:59:59Z";

describe("deadline line (AC-28)", () => {
  it("reads 'Fri, Nov 20, 11:59 p.m. ET · 2 business days left' in en-CA", () => {
    const t = createTranslator(en, "en", "referrals");
    expect(deadlineLine(t, createFormatter("en"), DEADLINE, 2)).toBe("Fri, Nov 20, 11:59 p.m. ET · 2 business days left");
    expect(deadlineLine(t, createFormatter("en"), DEADLINE, 1)).toBe("Fri, Nov 20, 11:59 p.m. ET · 1 business day left");
    expect(deadlineLine(t, createFormatter("en"), DEADLINE, 0)).toBe("Fri, Nov 20, 11:59 p.m. ET · Ends today");
    expect(deadlineLine(t, createFormatter("en"), DEADLINE, null)).toBe("Closed Fri, Nov 20, 11:59 p.m. ET");
  });

  it("uses Toronto wall time in fr-CA and pt-BR too (never the device zone, never UTC)", () => {
    const fx = deadlineLine(createTranslator(fr, "fr", "referrals"), createFormatter("fr"), DEADLINE, 2);
    const px = deadlineLine(createTranslator(pt, "pt", "referrals"), createFormatter("pt"), DEADLINE, 2);
    for (const s of [fx, px]) {
      expect(s).toMatch(/20/);
      expect(s).toMatch(/23[\s h:]*59/);
      expect(s).not.toMatch(/21|04[:h]59/);
      expect(s).toMatch(/\bET\b|\bHE\b|Toronto/); // the zone is always named (ET / HE / horário de Toronto)
      expect(s).not.toMatch(/\{\w+\}/); // no unresolved placeholder
    }
  });

  it("maps server days-left to states", () => {
    expect(deadlineState(null)).toBe("closed");
    expect(deadlineState(0)).toBe("today");
    expect(deadlineState(3)).toBe("open");
  });
});
