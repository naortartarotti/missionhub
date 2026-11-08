import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, type UserClient } from "@/server/supabase/server";
import { permissionsFor, type MembershipRole, type Permission } from "@/server/authorization/permissions";
import { AuthorizationError } from "@/server/auth/errors";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
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

export type MembershipSummary = { id: string; slug: string; name: string; role: MembershipRole; isDemo: boolean };

export const listMemberships = cache(async (): Promise<MembershipSummary[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("role, organizations!inner(id, slug, name, is_demo, suspended_at)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("organizations.suspended_at", null)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.organizations.id,
    slug: m.organizations.slug,
    name: m.organizations.name,
    isDemo: m.organizations.is_demo,
    role: m.role,
  }));
});

/**
 * Derives the tenant context from the URL slug + the authenticated session.
 * The organization id is NEVER taken from client input: it is resolved from an active membership.
 */
export const getRequestContext = cache(async (organizationSlug: string): Promise<RequestContext> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("role, organizations!inner(id, slug, name, default_currency, locale, is_demo, suspended_at)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("organizations.slug", organizationSlug)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.organizations.suspended_at) notFound();
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
  };
});

export function can(ctx: RequestContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}

export function assertCan(ctx: RequestContext, permission: Permission): void {
  if (!can(ctx, permission)) throw new AuthorizationError();
}
