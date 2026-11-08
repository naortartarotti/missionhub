"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { guard, id, parse } from "@/server/actions/guard";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/validation/form-data";
import { msg } from "@/i18n/translate";

const requestSchema = z.object({
  kind: z.enum(["access", "correction", "withdrawal", "deletion"]),
  requesterContact: z.string().trim().min(3, msg("settings.privacy.validation.contact")).max(200, msg("settings.privacy.validation.contactTooLong")),
  candidateId: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null),
  details: z.string().trim().max(2000).optional(),
});

export async function logPrivacyRequest(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "privacy:manage");
  const parsed = requestSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const { error } = await ctx.db.from("privacy_requests").insert({
    organization_id: ctx.organizationId,
    kind: parsed.data.kind,
    requester_contact: parsed.data.requesterContact,
    candidate_id: parsed.data.candidateId,
    details: parsed.data.details ?? null,
    created_by: ctx.userId,
  });
  if (error) return toActionError(error);
  revalidatePath(`/w/${orgSlug}/settings/privacy`);
  return { ok: true, message: msg("settings.privacy.messages.logged") };
  });
}

const updateSchema = z.object({
  id,
  status: z.enum(["in_progress", "completed", "rejected"]),
  resolution: z.string().trim().max(2000).default(""),
});

export async function updatePrivacyRequest(orgSlug: string, input: { id: string; status: "in_progress" | "completed" | "rejected"; resolution: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "privacy:manage");
    const v = parse(updateSchema, input);
    const { data, error } = await ctx.db
      .from("privacy_requests")
      .update({ status: v.status, resolution: v.resolution || null, handled_by: ctx.userId })
      .eq("id", v.id)
      .eq("organization_id", ctx.organizationId)
      .select("id");
    if (error) return toActionError(error);
    if (!data?.length) return { ok: false, error: msg("settings.privacy.errors.notFound") };
    revalidatePath(`/w/${orgSlug}/settings/privacy`);
    return { ok: true, message: msg("settings.privacy.messages.updated") };
  });
}
