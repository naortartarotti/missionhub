"use server";

import { z } from "zod";

import { guard, id, parse, rateLimit } from "@/server/actions/guard";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/server/supabase/server";
import { assertCan, getRequestContext, requireUser } from "@/server/auth/context";
import { env } from "@/server/env";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { createOrganizationSchema, inviteSchema, memberUpdateSchema, splitList } from "./schemas";

export async function createOrganization(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireUser();
    await rateLimit(await createClient(), "org.create", 5, 3600);
    const parsed = createOrganizationSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const supabase = await createClient();
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
    const { data: orgId, error } = await supabase.rpc("create_organization", {
      p_name: parsed.data.name,
      p_slug: parsed.data.slug,
      p_kind: parsed.data.kind,
    });
    if (error) {
      const r = toActionError(error);
      return error.message.includes("slug_taken") || error.message.includes("duplicate")
        ? { ok: false, error: "That workspace URL is taken.", fieldErrors: { slug: ["That workspace URL is taken. Try another."] } }
        : r;
    }
    if (parsed.data.currency !== "CAD") {
      // The creator is org_admin now, so RLS allows this column update.
      const { error: cErr } = await supabase.from("organizations").update({ default_currency: parsed.data.currency }).eq("id", orgId as string);
      if (cErr) return toActionError(cErr);
    }
    redirect(`/w/${parsed.data.slug}/overview`);
  });
}

export async function inviteMember(orgSlug: string, _: ActionResult<{ link: string }> | null, formData: FormData): Promise<ActionResult<{ link: string }>> {
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
    revalidatePath(`/w/${orgSlug}/settings/team`);
    const link = `${env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
    // Email delivery is NOT configured unless EMAIL_PROVIDER is set; the UI shows the link to copy.
    return {
      ok: true,
      data: { link },
      message: "Invitation created. Email delivery isn't configured, so share this one-time link securely.",
    };
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
    revalidatePath(`/w/${orgSlug}/settings/team`);
    return { ok: true, message: "Invitation revoked." };
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
    if (!target) return { ok: false, error: "Member not found." };
    if (target.user_id === ctx.userId) return { ok: false, error: "You can't change your own role or status." };
    const patch: { role?: typeof parsed.data.role; status?: typeof parsed.data.status } = {};
    if (parsed.data.role) patch.role = parsed.data.role;
    if (parsed.data.status) patch.status = parsed.data.status;
    const { error } = await ctx.db.from("organization_memberships").update(patch).eq("id", parsed.data.membershipId).eq("organization_id", ctx.organizationId);
    if (error) return toActionError(error);
    revalidatePath(`/w/${orgSlug}/settings/team`);
    return { ok: true, message: "Member updated." };
  });
}

export async function acceptInvitation(token: string): Promise<ActionResult> {
  return guard(async () => {
    await requireUser();
    const supabase = await createClient();
    const t = parse(z.string().regex(/^[a-f0-9]{48}$/, "This invitation link is invalid."), token);
    await rateLimit(supabase, "org.accept_invitation", 10, 600);
    const { data: slug, error } = await supabase.rpc("accept_invitation", { p_token: t });
    if (error) return toActionError(error);
    redirect(`/w/${slug}/overview`);
  });
}

export async function updateOrganization(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "team:manage");
    const name = String(formData.get("name") ?? "").trim();
    const currency = String(formData.get("currency") ?? "CAD");
    if (name.length < 2 || name.length > 120) return { ok: false, error: "Enter a valid name.", fieldErrors: { name: ["Enter a valid name."] } };
    if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "Invalid currency." };
    const { error } = await ctx.db.from("organizations").update({ name, default_currency: currency }).eq("id", ctx.organizationId);
    if (error) return toActionError(error);
    revalidatePath(`/w/${orgSlug}`, "layout");
    return { ok: true, message: "Organization updated." };
  });
}
