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
  "integrations:manage",
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
  recruiter_manager: [...RECRUITER, "candidates:anonymize", "audit:read", "privacy:manage", "integrations:manage"],
  org_admin: PERMISSIONS,
};

export function permissionsFor(role: MembershipRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/**
 * RD-036: roles that see the whole agency's candidates, referrals and commissions. A plain
 * `recruiter` sees only their own records (enforced by RLS via app.sees_all and the RPCs).
 * Keep in sync with app.sees_all() in supabase/migrations/20261115000300_recruiter_record_scope.sql.
 */
export const AGENCY_WIDE_ROLES: readonly MembershipRole[] = ["org_admin", "recruiter_manager"];

export function seesWholeAgency(role: MembershipRole): boolean {
  return AGENCY_WIDE_ROLES.includes(role);
}
