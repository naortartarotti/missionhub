import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient, type UserClient } from "@/server/supabase/server";
import { permissionsFor, seesWholeAgency, type MembershipRole, type Permission } from "@/server/authorization/permissions";
import { AuthorizationError, RulesAcceptanceRequiredError, SettlementModeError } from "@/server/auth/errors";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
};

/** BR-12 restriction reason of the caller's own org (EC-7). Never shown to other orgs. */
export type OrgRestriction = "terminated" | "suspended" | "network_hold" | "rules_not_accepted" | "network_pending";

export type RulesVersionRef = { id: string; label: string; effectiveAt: string; type?: string };
export type OrgAcceptanceRef = { at: string | null; byName: string | null } | null;

/** EC-7: the caller's own org state, read once per request through get_my_org_state (the DB is the gate). */
export type OrgRulesState = {
  current: RulesVersionRef | null;
  /** The latest effective version that needs acceptance (non-material versions never do). */
  required: RulesVersionRef | null;
  upcoming: RulesVersionRef | null;
  /** BR-7: true when a current version exists and the user has never accepted any version. */
  gateRequired: boolean;
  memberAcceptedAny: boolean;
  /** Accepted the required version (or a later one). */
  memberAcceptedCurrent: boolean;
  memberAcceptedUpcoming: boolean;
  /** `byName` only for org_admin. `{ at: null }` when no acceptance-requiring version exists. */
  orgAcceptedCurrent: OrgAcceptanceRef;
  orgAcceptedUpcoming: OrgAcceptanceRef;
  /** BR-9 b: accepted an earlier version but not the one in force. */
  userRestricted: boolean;
};

export type RequestContext = {
  user: SessionUser;
  userId: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  currency: string;
  locale: string;
  isDemo: boolean;
  membershipRole: MembershipRole;
  permissions: Permission[];
  /** User-scoped client: RLS applies to every query made with it. */
  db: UserClient;
  /** N10 (EC-7): the org's partner-activity restriction, own org only. */
  restriction: OrgRestriction | null;
  /** N10 (BR-33): suspended or terminated with open obligations. Only opt-in callers ever see `true`. */
  settlementMode: boolean;
  settlementKind: "suspended" | "terminated" | null;
  /** When the suspension / termination started (B6 banner date). Own org only. */
  suspendedAt: string | null;
  terminatedAt: string | null;
  /** BR-10: French first (until N5's province field, the org locale starting with "fr"). */
  quebec: boolean;
  rules: OrgRulesState;
};

export type RequestContextOptions = {
  /** BR-34 surfaces opt in. Without it a settlement-mode org is not-found (pages) or refused (actions). */
  allowSettlement?: boolean;
  /** BR-7 exempt list (accepting the rules, marking notifications read). */
  rulesGateExempt?: boolean;
};

/** Validates the session against Supabase Auth (not just the cookie). Request-scoped memoization. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_platform_admin, email")
    .eq("id", user.id)
    .single();
  return {
    id: user.id,
    email: profile?.email ?? user.email ?? "",
    fullName: profile?.full_name ?? "",
    isPlatformAdmin: profile?.is_platform_admin ?? false,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}

export type MembershipSummary = { id: string; slug: string; name: string; role: MembershipRole; isDemo: boolean; settlementMode: boolean };

/** EC-7: active memberships, settlement-mode orgs included (marked), closed (terminated and settled) orgs excluded. */
export const listMemberships = cache(async (): Promise<MembershipSummary[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_organizations");
  if (error) throw error;
  return (data ?? []).map((m) => ({ id: m.id, slug: m.slug, name: m.name, isDemo: m.is_demo, role: m.role, settlementMode: m.settlement_mode }));
});

type OrgStateRow = {
  role: MembershipRole;
  restriction: OrgRestriction | null;
  settlement_mode: boolean;
  settlement_kind: "suspended" | "terminated" | null;
  suspended_at?: string | null;
  terminated_at?: string | null;
  quebec: boolean;
  rules: {
    current: { id: string; label: string; effective_at: string; type: string } | null;
    required: { id: string; label: string; effective_at: string } | null;
    upcoming: { id: string; label: string; effective_at: string; type: string } | null;
    gate_required: boolean;
    member_accepted_any: boolean;
    member_accepted_current: boolean;
    member_accepted_upcoming: boolean;
    org_accepted_current: { at: string | null; by_name: string | null } | null;
    org_accepted_upcoming: { at: string | null; by_name: string | null } | null;
    user_restricted: boolean;
  };
};

const versionRef = (v: { id: string; label: string; effective_at: string; type?: string } | null): RulesVersionRef | null =>
  v ? { id: v.id, label: v.label, effectiveAt: v.effective_at, type: v.type } : null;
const acceptanceRef = (a: { at: string | null; by_name: string | null } | null): OrgAcceptanceRef => (a ? { at: a.at, byName: a.by_name } : null);

/** True while handling a Server Action POST (Next sets the Next-Action header). Pages render the gate instead. */
async function isServerAction(): Promise<boolean> {
  try {
    return (await headers()).has("next-action");
  } catch {
    return false;
  }
}

const loadRequestContext = cache(async (organizationSlug: string, allowSettlement: boolean, rulesGateExempt: boolean): Promise<RequestContext> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("role, organizations!inner(id, slug, name, default_currency, locale, is_demo)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("organizations.slug", organizationSlug)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  const { data: rawState, error: sErr } = await supabase.rpc("get_my_org_state", { p_org: data.organizations.id });
  // not_found = terminated and settled (BR-37): members lose access, as before N10.
  if (sErr && !/not_found/.test(sErr.message)) throw sErr;
  if (sErr || !rawState) notFound();
  const state = rawState as unknown as OrgStateRow;
  const action = await isServerAction();
  if (state.settlement_mode && !allowSettlement) {
    if (action) throw new SettlementModeError();
    notFound();
  }
  if (action && state.rules.gate_required && !rulesGateExempt) throw new RulesAcceptanceRequiredError();
  return {
    user,
    userId: user.id,
    organizationId: data.organizations.id,
    organizationSlug: data.organizations.slug,
    organizationName: data.organizations.name,
    currency: data.organizations.default_currency,
    locale: data.organizations.locale,
    isDemo: data.organizations.is_demo,
    membershipRole: data.role,
    permissions: permissionsFor(data.role),
    db: supabase,
    restriction: state.restriction,
    settlementMode: state.settlement_mode,
    settlementKind: state.settlement_kind,
    suspendedAt: state.suspended_at ?? null,
    terminatedAt: state.terminated_at ?? null,
    quebec: state.quebec,
    rules: {
      current: versionRef(state.rules.current),
      required: versionRef(state.rules.required),
      upcoming: versionRef(state.rules.upcoming),
      gateRequired: state.rules.gate_required,
      memberAcceptedAny: state.rules.member_accepted_any,
      memberAcceptedCurrent: state.rules.member_accepted_current,
      memberAcceptedUpcoming: state.rules.member_accepted_upcoming,
      orgAcceptedCurrent: acceptanceRef(state.rules.org_accepted_current),
      orgAcceptedUpcoming: acceptanceRef(state.rules.org_accepted_upcoming),
      userRestricted: state.rules.user_restricted,
    },
  };
});

/**
 * Derives the tenant context from the URL slug + the authenticated session.
 * The organization id is NEVER taken from client input: it is resolved from an active membership.
 *
 * N10 (EC-1, EC-7, BR-7):
 * - Settlement mode is default-deny: unless `allowSettlement` is passed, a suspended or terminated
 *   org is not-found for pages (as before N10) and `SettlementModeError` for Server Actions
 *   (guard → `settlement_mode_unavailable`). RLS and the RPCs are the real gate.
 * - In a Server Action, a user who has never accepted any rules version gets
 *   `RulesAcceptanceRequiredError` (guard → `rules_acceptance_required`) unless `rulesGateExempt`.
 *   Pages never throw for the gate: they read `ctx.rules.gateRequired` and render the gate screen.
 */
export async function getRequestContext(organizationSlug: string, opts: RequestContextOptions = {}): Promise<RequestContext> {
  return loadRequestContext(organizationSlug, opts.allowSettlement ?? false, opts.rulesGateExempt ?? false);
}

export function can(ctx: RequestContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}

export function assertCan(ctx: RequestContext, permission: Permission): void {
  if (!can(ctx, permission)) throw new AuthorizationError();
}

/**
 * RD-036: true for org_admin and recruiter_manager, who see the whole agency's candidates,
 * referrals and commissions. False for a plain recruiter, who sees only their own records
 * (the database enforces it; this only drives the UI, e.g. hiding the "team / mine" filter).
 */
export function canSeeAgency(ctx: Pick<RequestContext, "membershipRole">): boolean {
  return seesWholeAgency(ctx.membershipRole);
}

/** RD-036: jobs are readable by the whole agency, but only their owner or a manager edits them. */
export function canEditJob(ctx: Pick<RequestContext, "membershipRole" | "userId">, job: { owner_id: string }): boolean {
  return job.owner_id === ctx.userId || canSeeAgency(ctx);
}
