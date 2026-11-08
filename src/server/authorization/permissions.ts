import type { Database } from "@/server/db/database.types";

export type MembershipRole = Database["public"]["Enums"]["membership_role"];

export const PERMISSIONS = [
  "candidates:read",
  "candidates:write",
  "candidates:anonymize",
  "jobs:read",
  "jobs:write",
  "referrals:submit",
  "referrals:review",
  "commissions:read",
  "commissions:record",
  "team:read",
  "team:manage",
  "audit:read",
  "privacy:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const RECRUITER: Permission[] = [
  "candidates:read",
  "candidates:write",
  "jobs:read",
  "jobs:write",
  "referrals:submit",
  "referrals:review",
  "commissions:read",
  "commissions:record",
  "team:read",
];

export const ROLE_PERMISSIONS: Record<MembershipRole, readonly Permission[]> = {
  recruiter: RECRUITER,
  recruiter_manager: [...RECRUITER, "candidates:anonymize", "audit:read", "privacy:manage"],
  org_admin: PERMISSIONS,
};

export function permissionsFor(role: MembershipRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export const ROLE_LABELS: Record<MembershipRole, string> = {
  org_admin: "Organization admin",
  recruiter_manager: "Recruiter manager",
  recruiter: "Recruiter",
};
