import { describe, expect, it, vi } from "vitest";

// context.ts pulls in Next and the Supabase server client; only the pure helpers are under test.
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/server/supabase/server", () => ({ createClient: vi.fn() }));

import { AGENCY_WIDE_ROLES, seesWholeAgency } from "@/server/authorization/permissions";
import { canEditJob, canSeeAgency } from "@/server/auth/context";

describe("RD-036 agency scope", () => {
  it("only org_admin and recruiter_manager see the whole agency", () => {
    expect([...AGENCY_WIDE_ROLES].sort()).toEqual(["org_admin", "recruiter_manager"]);
    expect(seesWholeAgency("org_admin")).toBe(true);
    expect(seesWholeAgency("recruiter_manager")).toBe(true);
    expect(seesWholeAgency("recruiter")).toBe(false);
  });

  it("canSeeAgency follows the membership role", () => {
    expect(canSeeAgency({ membershipRole: "recruiter" })).toBe(false);
    expect(canSeeAgency({ membershipRole: "recruiter_manager" })).toBe(true);
    expect(canSeeAgency({ membershipRole: "org_admin" })).toBe(true);
  });

  it("canEditJob: the owner, or a manager", () => {
    const job = { owner_id: "u-owner" };
    expect(canEditJob({ membershipRole: "recruiter", userId: "u-owner" }, job)).toBe(true);
    expect(canEditJob({ membershipRole: "recruiter", userId: "u-colleague" }, job)).toBe(false);
    expect(canEditJob({ membershipRole: "recruiter_manager", userId: "u-colleague" }, job)).toBe(true);
    expect(canEditJob({ membershipRole: "org_admin", userId: "u-colleague" }, job)).toBe(true);
  });
});
