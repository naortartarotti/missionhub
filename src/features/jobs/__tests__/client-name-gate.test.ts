import { describe, expect, it } from "vitest";
import { jobFormSchema } from "../schemas";

const job = { title: "Senior Engineer", workArrangement: "hybrid", contractType: "permanent", salaryCurrency: "CAD", status: "draft" };
const card = {
  acceptsExternalReferrals: "on", feeBasis: "pct_base", feeRate: "20", searchType: "contingent_shared",
  guaranteeDays: "90", guaranteeRemedy: "replacement_then_prorata", paymentTermsDays: "30", ownershipMonths: "6", directClientAttested: "on",
};
const errors = (input: Record<string, unknown>) => {
  const r = jobFormSchema.safeParse(input);
  return r.success ? {} : (r.error.flatten().fieldErrors as Record<string, string[]>);
};

describe("N3 BR-1: a real client name to open a job to partners (AC-1)", () => {
  it("refuses an empty or placeholder name while the job is opened, drafts included, even with Hide client", () => {
    for (const clientName of ["", "Confidential", "N/A", "TBD", "client confidentiel"]) {
      const e = errors({ ...job, ...card, clientName, clientConfidential: "on" });
      expect(e.clientName?.[0]).toMatch(/clientRequiredForPartners$/);
    }
  });

  it("accepts a real name (Hide client on or off), and leaves the name optional when the job isn't opened", () => {
    expect(errors({ ...job, ...card, clientName: "Acme Robotics", clientConfidential: "on" }).clientName).toBeUndefined();
    expect(errors({ ...job, ...card, clientName: "Acme Robotics" }).clientName).toBeUndefined();
    expect(errors({ ...job, clientName: "", clientConfidential: "on" }).clientName).toBeUndefined();
  });
});
