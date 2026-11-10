"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCan, getRequestContext, requireUser } from "@/server/auth/context";
import { guard, id, parse, rateLimit, text } from "@/server/actions/guard";
import { createClient } from "@/server/supabase/server";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/validation/form-data";
import { parseMajorToMinor } from "@/lib/money/format";
import { msg } from "@/i18n/translate";

const invoiceSchema = z.object({
  placementId: z.uuid(),
  number: z.string().trim().min(1, msg("commissions.validation.invoiceNumber")).max(80),
  amount: z.string().min(1, msg("commissions.validation.amount")),
  tax: z.string().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  issuedOn: z.iso.date(msg("commissions.validation.issueDate")),
  dueOn: z.string().optional(),
});

const evidenceSchema = z.object({
  placementId: z.uuid(),
  kind: z.enum(["client_payment", "sourcing_payout", "platform_remittance", "client_refund"]),
  amount: z.string().min(1, msg("commissions.validation.amount")),
  processingFee: z.string().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  occurredOn: z.iso.date(msg("commissions.validation.date")),
  reference: z.string().trim().min(3, msg("commissions.validation.reference")).max(200),
  notes: z.string().trim().max(2000).optional(),
  idempotencyKey: z.uuid(),
});

export async function recordInvoice(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "commissions:record");
    const parsed = invoiceSchema.safeParse(formToObject(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;
    const amount = parseMajorToMinor(v.amount, v.currency);
    const tax = v.tax ? parseMajorToMinor(v.tax, v.currency) : 0;
    if (!amount || tax === null) return { ok: false, error: msg("commissions.validation.invalidAmounts"), fieldErrors: { amount: [msg("commissions.validation.invalidAmount")] } };
    const { error } = await ctx.db.rpc("record_invoice", {
      p_placement: v.placementId, p_number: v.number, p_amount_minor: amount, p_tax_minor: tax, p_issued_on: v.issuedOn, p_due_on: v.dueOn || (null as unknown as string),
    });
    if (error) return toActionError(error);
    revalidatePath(`/w/${orgSlug}/wallet/placements/${v.placementId}`);
    return { ok: true, message: msg("commissions.messages.invoiceRecorded") };
  });
}

export async function recordEvidence(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "commissions:record");
    const parsed = evidenceSchema.safeParse(formToObject(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;
    const amount = parseMajorToMinor(v.amount, v.currency);
    const fee = v.processingFee ? parseMajorToMinor(v.processingFee, v.currency) : 0;
    if (!amount || fee === null) return { ok: false, error: msg("commissions.validation.invalidAmounts"), fieldErrors: { amount: [msg("commissions.validation.invalidAmount")] } };
    const { error } = await ctx.db.rpc("record_payment_evidence", {
      p_placement: v.placementId, p_kind: v.kind, p_amount_minor: amount, p_processing_fee_minor: fee,
      p_occurred_on: v.occurredOn, p_reference: v.reference, p_notes: v.notes ?? "", p_idempotency_key: v.idempotencyKey,
    });
    if (error) return toActionError(error);
    revalidatePath(`/w/${orgSlug}/wallet/placements/${v.placementId}`);
    return { ok: true, message: msg("commissions.messages.evidenceRecorded") };
  });
}

const reviewSchema = z.object({
  evidenceId: id,
  approve: z.boolean(),
  note: z.string().trim().max(1000).default(""),
  orgSlug: z.string().regex(/^[a-z0-9-]{3,48}$/).optional(),
  placementId: id.optional(),
});

/** Works from an org workspace (sourcing org confirming a payout) or from the platform admin area. */
export async function reviewEvidence(input: { evidenceId: string; approve: boolean; note: string; orgSlug?: string; placementId?: string }): Promise<ActionResult> {
  return guard(async () => {
    const v = parse(reviewSchema, input);
    if (!v.approve && v.note.length < 3) return { ok: false, error: msg("commissions.validation.rejectReason") };
    // From a workspace, the membership is resolved server-side; otherwise the RPC requires platform admin.
    const db = v.orgSlug ? (await getRequestContext(v.orgSlug)).db : (await requireUser(), await createClient());
    const { error } = await db.rpc("review_payment_evidence", { p_evidence: v.evidenceId, p_approve: v.approve, p_note: v.note });
    if (error) return toActionError(error);
    if (v.orgSlug && v.placementId) revalidatePath(`/w/${v.orgSlug}/wallet/placements/${v.placementId}`);
    revalidatePath("/admin");
    return { ok: true, message: v.approve ? msg("commissions.messages.verified") : msg("commissions.messages.rejected") };
  });
}

const disputeSchema = z.object({ placementId: id, reason: text(10, 2000, msg("commissions.validation.disputeReason")) });

export async function openDispute(orgSlug: string, input: { placementId: string; reason: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "commissions:read");
    const v = parse(disputeSchema, input);
    await rateLimit(ctx.db, "dispute.open", 5, 3600);
    const { error } = await ctx.db.rpc("open_dispute", { p_placement: v.placementId, p_reason: v.reason });
    if (error) return toActionError(error);
    revalidatePath(`/w/${orgSlug}/wallet/placements/${v.placementId}`);
    return { ok: true, message: msg("commissions.messages.disputeOpened") };
  });
}
