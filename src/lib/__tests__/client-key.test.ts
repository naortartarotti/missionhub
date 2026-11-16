import { describe, expect, it } from "vitest";
import { clientKey } from "../client-key";

// The SQL ↔ TS parity check runs against the database in tests/integration/n3-record-hire.test.ts.
describe("clientKey (TS mirror of app.client_key, N1 BR-23; N3 BR-1)", () => {
  it("normalises case, accents, punctuation, spacing and trailing legal forms", () => {
    expect(clientKey("  ACME   Robotics, Inc. ")).toBe("acme robotics");
    expect(clientKey("Société Générale S.A.")).toBe("societe generale");
    expect(clientKey("Brook & Street Ltd")).toBe("brook street");
    expect(clientKey("O'Reilly Co")).toBe("oreilly");
    expect(clientKey("Müller GmbH")).toBe("muller");
    expect(clientKey("Corp")).toBe("corp"); // a lone legal form is kept (one token)
  });

  it("gives no key for empty names and placeholders", () => {
    for (const n of [null, undefined, "", "   ", "Confidential", "confidentiel", "N/A", "TBD", "Client", "Client confidentiel",
      "Undisclosed client", "Stealth Startup Inc.", "Confidential Ltd"]) {
      expect(clientKey(n), String(n)).toBeNull();
    }
  });
});
