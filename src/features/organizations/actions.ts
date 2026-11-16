"use server";

import { z } from "zod";

import { guard, id, parse, rateLimit } from "@/server/actions/guard";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/server/supabase/server";
import { assertCan, getRequestContext, requireUser } from "@/server/auth/context";
import { env, integrations } from "@/server/env";
import { sendEmail } from "@/server/integrations/email";
import { teamInviteEmail } from "@/server/email/templates";
import { getGlobalT, getLocale } from "@/i18n/server";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { createOrganizationSchema, inviteSchema, memberUpdateSchema, splitList } from "./schemas";
import { msg } from "@/i18n/translate";

export async function createOrganization(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireUser();
    await rateLimit(await createClient(), "org.create", 5, 3600);
    const parsed = createOrganizationSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const supabase = await createClient();
    // N10 BR-6: the org and both acceptances are created first, in one transaction. The profile update
    // comes after it: a user who has never accepted the rules can't write anything else (BR-7 gate).
    const { data: orgId, error } = await supabase.rpc("create_organization", {
      p_name: parsed.data.name,
      p_slug: parsed.data.slug,
      p_kind: "agency",
      p_rules_version: parsed.data.rulesVersionId,
      p_rules_locale: parsed.data.rulesLocale,
      p_accept_org: parsed.data.acceptOrg,
      p_accept_member: parsed.data.acceptMember,
    });
    if (error) {
      const r = toActionError(error);
      return error.message.includes("slug_taken") || error.message.includes("duplicate")
        ? { ok: false, error: msg("onboarding.errors.slugTaken"), fieldErrors: { slug: [msg("onboarding.errors.slugTakenField")] } }
        : r;
    }
    const { error: pErr } = await supabase
      .from("profiles")
      .update({
        headline: parsed.data.headline || null,
        specialties: splitList(parsed.data.specialties),
        regions: splitList(parsed.data.regions),
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (pErr) return toActionError(pErr);
    // The creator is org_admin now, so RLS allows these column updates.
    const { error: cErr } = await supabase
      .from("organizations")
      .update({ default_currency: parsed.data.currency, country: parsed.data.country })
      .eq("id", orgId as string);
    if (cErr) return toActionError(cErr);
    redirect(`/workspace/${parsed.data.slug}/overview`);
  });
}

export async function inviteMember(
  orgSlug: string,
  _: ActionResult<{ link: string; emailed: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "team:manage");
    await rateLimit(ctx.db, "org.invite", 30, 3600);
    const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const { data: token, error } = await ctx.db.rpc("create_invitation", {
      p_org: ctx.organizationId,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
    });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/settings/team`);
    const link = `${env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
    if (!integrations.email) {
      return { ok: true, data: { link, emailed: false }, message: msg("onboarding.messages.invitationCreated") };
    }
    // The link stays visible in the UI either way, so a delivery failure never loses the invite.
    const [tg, locale] = await Promise.all([getGlobalT(), getLocale()]);
    const email = await teamInviteEmail(locale, {
      inviter: ctx.user.fullName || ctx.user.email,
      org: ctx.organizationName,
      role: tg(`labels.role.${parsed.data.role}`),
      email: parsed.data.email,
      url: link,
    });
    const result = await sendEmail({ to: parsed.data.email, ...email });
    return result.sent
      ? { ok: true, data: { link, emailed: true }, message: msg("onboarding.messages.invitationSent", { email: parsed.data.email }) }
      : { ok: true, data: { link, emailed: false }, message: msg("onboarding.messages.invitationEmailFailed") };
  });
}

export async function revokeInvitation(orgSlug: string, invitationId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "team:manage");
    parse(id, invitationId);
    const { error } = await ctx.db
      .from("organization_invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId)
      .eq("organization_id", ctx.organizationId)
      .eq("status", "pending");
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/settings/team`);
    return { ok: true, message: msg("onboarding.messages.invitationRevoked") };
  });
}

export async function updateMember(orgSlug: string, input: { membershipId: string; role?: string; status?: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "team:manage");
    const parsed = memberUpdateSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const { data: target } = await ctx.db
      .from("organization_memberships")
      .select("user_id, role")
      .eq("id", parsed.data.membershipId)
      .eq("organization_id", ctx.organizationId)
      .single();
    if (!target) return { ok: false, error: msg("onboarding.errors.memberNotFound") };
    if (target.user_id === ctx.userId) return { ok: false, error: msg("onboarding.errors.selfChange") };
    const patch: { role?: typeof parsed.data.role; status?: typeof parsed.data.status } = {};
    if (parsed.data.role) patch.role = parsed.data.role;
    if (parsed.data.status) patch.status = parsed.data.status;
    const { error } = await ctx.db.from("organization_memberships").update(patch).eq("id", parsed.data.membershipId).eq("organization_id", ctx.organizationId);
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/settings/team`);
    return { ok: true, message: msg("onboarding.messages.memberUpdated") };
  });
}

const transferSchema = z.object({ fromUserId: id, toUserId: id }).refine((v) => v.fromUserId !== v.toUserId, { path: ["toUserId"], message: msg("onboarding.errors.transferSame") });

/** Hands every candidate, job and connector a member owns to a teammate (e.g. when they leave). */
export async function transferPortfolio(orgSlug: string, input: { fromUserId: string; toUserId: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "team:manage");
    const v = parse(transferSchema, input);
    const { data, error } = await ctx.db.rpc("transfer_member_portfolio", { p_org: ctx.organizationId, p_from: v.fromUserId, p_to: v.toUserId });
    if (error) return toActionError(error);
    const r = (data ?? {}) as { candidates?: number; jobs?: number };
    revalidatePath(`/workspace/${orgSlug}`, "layout");
    return { ok: true, message: msg("onboarding.messages.portfolioTransferred", { candidates: r.candidates ?? 0, jobs: r.jobs ?? 0 }) };
  });
}

export async function acceptInvitation(token: string): Promise<ActionResult> {
  return guard(async () => {
    await requireUser();
    const supabase = await createClient();
    const t = parse(z.string().regex(/^[a-f0-9]{48}$/, msg("onboarding.errors.invitationInvalid")), token);
    await rateLimit(supabase, "org.accept_invitation", 10, 600);
    const { data: slug, error } = await supabase.rpc("accept_invitation", { p_token: t });
    if (error) return toActionError(error);
    redirect(`/workspace/${slug}/overview`);
  });
}

export async function updateOrganization(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "team:manage");
    const name = String(formData.get("name") ?? "").trim();
    const currency = String(formData.get("currency") ?? "CAD");
    if (name.length < 2 || name.length > 120) return { ok: false, error: msg("onboarding.errors.nameInvalid"), fieldErrors: { name: [msg("onboarding.errors.nameInvalid")] } };
    if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: msg("onboarding.errors.currencyInvalid") };
    const { error } = await ctx.db.from("organizations").update({ name, default_currency: currency }).eq("id", ctx.organizationId);
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}`, "layout");
    return { ok: true, message: msg("onboarding.messages.organizationUpdated") };
  });
}
