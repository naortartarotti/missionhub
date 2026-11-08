"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/validation/form-data";

const requestSchema = z.object({
  kind: z.enum(["access", "correction", "withdrawal", "deletion"]),
  requesterContact: z.string().trim().min(3, "How can we reach the requester?").max(200),
  candidateId: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null),
  details: z.string().trim().max(2000).optional(),
});

export async function logPrivacyRequest(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
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
  return { ok: true, message: "Request logged. Respond within the statutory timeline (PIPEDA: generally 30 days)." };
}

export async function updatePrivacyRequest(orgSlug: string, input: { id: string; status: "in_progress" | "completed" | "rejected"; resolution: string }): Promise<ActionResult> {
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "privacy:manage");
  const { error } = await ctx.db
    .from("privacy_requests")
    .update({ status: input.status, resolution: input.resolution || null, handled_by: ctx.userId })
    .eq("id", input.id)
    .eq("organization_id", ctx.organizationId);
  if (error) return toActionError(error);
  revalidatePath(`/w/${orgSlug}/settings/privacy`);
  return { ok: true, message: "Request updated." };
}
