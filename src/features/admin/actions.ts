"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/server/supabase/server";
import { getSessionUser } from "@/server/auth/context";
import { AuthorizationError } from "@/server/auth/errors";
import { guard, id, parse, text } from "@/server/actions/guard";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { msg } from "@/i18n/translate";

/** Platform-admin gate. The RPCs re-check app.is_platform_admin() in the database. */
async function adminDb() {
  const user = await getSessionUser();
  if (!user?.isPlatformAdmin) throw new AuthorizationError();
  return createClient();
}

const suspensionSchema = z.object({ orgId: id, suspend: z.boolean(), reason: z.string().trim().max(500) }).refine((v) => !v.suspend || v.reason.length >= 5, {
  message: msg("admin.validation.reason"),
  path: ["reason"],
});

export async function setSuspension(input: { orgId: string; suspend: boolean; reason: string }): Promise<ActionResult> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(suspensionSchema, input);
    const { error } = await db.rpc("set_organization_suspension", { p_org: v.orgId, p_suspend: v.suspend, p_reason: v.reason });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    return { ok: true, message: v.suspend ? msg("admin.messages.suspended") : msg("admin.messages.reinstated") };
  });
}

const disputeSchema = z.object({ disputeId: id, upheld: z.boolean(), resolution: text(5, 2000, msg("admin.validation.resolution")) });

export async function resolveDispute(input: { disputeId: string; upheld: boolean; resolution: string }): Promise<ActionResult> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(disputeSchema, input);
    const { error } = await db.rpc("resolve_dispute", { p_dispute: v.disputeId, p_resolution: v.resolution, p_upheld: v.upheld });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    return { ok: true, message: msg("admin.messages.disputeClosed") };
  });
}

const percent = z.coerce.number().min(0).max(100).transform((n) => Math.round(n * 100));
const ruleSchema = z
  .object({ name: z.string().trim().max(120).optional(), sourcing: percent, jobOwner: percent, platform: percent })
  .refine((v) => v.sourcing + v.jobOwner + v.platform === 10000, { message: msg("admin.validation.total"), path: ["platform"] });

export async function publishRule(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(ruleSchema, Object.fromEntries(formData));
    const { error } = await db.rpc("publish_commission_rule", {
      p_name: v.name || "Standard marketplace split",
      p_sourcing: v.sourcing,
      p_job_owner: v.jobOwner,
      p_platform: v.platform,
    });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    return { ok: true, message: msg("admin.messages.rulePublished") };
  });
}

const freezeSchema = z.object({ orgId: id, frozen: z.boolean(), reason: z.string().trim().max(500) }).refine((v) => !v.frozen || v.reason.length >= 5, {
  message: msg("admin.validation.reason"),
  path: ["reason"],
});

/** Pauses or resumes an organization's outgoing wallet movements. It can still receive funds. */
export async function setWalletFrozen(input: { orgId: string; frozen: boolean; reason: string }): Promise<ActionResult> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(freezeSchema, input);
    const { error } = await db.rpc("set_wallet_frozen", { p_org: v.orgId, p_frozen: v.frozen, p_reason: v.reason });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    return { ok: true, message: v.frozen ? msg("admin.messages.walletFrozen") : msg("admin.messages.walletUnfrozen") };
  });
}

const transfersSchema = z.object({ enabled: z.boolean() });

/** Platform-wide switch for recruiter-to-recruiter wallet transfers. */
export async function setWalletTransfersEnabled(input: { enabled: boolean }): Promise<ActionResult> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(transfersSchema, input);
    const { error } = await db.rpc("set_wallet_transfers_enabled", { p_enabled: v.enabled });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    return { ok: true, message: v.enabled ? msg("admin.messages.transfersEnabled") : msg("admin.messages.transfersDisabled") };
  });
}

/** Platform-wide switch for withdrawals to organizations' payout accounts. */
export async function setWalletCashoutsEnabled(input: { enabled: boolean }): Promise<ActionResult> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(transfersSchema, input);
    const { error } = await db.rpc("set_wallet_cashouts_enabled", { p_enabled: v.enabled });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    return { ok: true, message: v.enabled ? msg("admin.messages.cashoutsEnabled") : msg("admin.messages.cashoutsDisabled") };
  });
}
