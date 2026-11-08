"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCan, getRequestContext, getSessionUser } from "@/server/auth/context";
import { createClient } from "@/server/supabase/server";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/validation/form-data";
import { parseMajorToMinor } from "@/lib/money/format";

const invoiceSchema = z.object({
  placementId: z.uuid(),
  number: z.string().trim().min(1, "Enter the invoice number").max(80),
  amount: z.string().min(1, "Enter the amount"),
  tax: z.string().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  issuedOn: z.iso.date("Enter the issue date"),
  dueOn: z.string().optional(),
});

const evidenceSchema = z.object({
  placementId: z.uuid(),
  kind: z.enum(["client_payment", "sourcing_payout", "platform_remittance", "client_refund"]),
  amount: z.string().min(1, "Enter the amount"),
  processingFee: z.string().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  occurredOn: z.iso.date("Enter the date"),
  reference: z.string().trim().min(3, "Enter a bank/transfer reference").max(200),
  notes: z.string().trim().max(2000).optional(),
  idempotencyKey: z.uuid(),
});

export async function recordInvoice(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "commissions:record");
  const parsed = invoiceSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  const amount = parseMajorToMinor(v.amount, v.currency);
  const tax = v.tax ? parseMajorToMinor(v.tax, v.currency) : 0;
  if (!amount || tax === null) return { ok: false, error: "Enter valid amounts.", fieldErrors: { amount: ["Enter a valid amount"] } };
  const { error } = await ctx.db.rpc("record_invoice", {
    p_placement: v.placementId, p_number: v.number, p_amount_minor: amount, p_tax_minor: tax, p_issued_on: v.issuedOn, p_due_on: v.dueOn || (null as unknown as string),
  });
  if (error) return toActionError(error);
  revalidatePath(`/w/${orgSlug}/commissions/${v.placementId}`);
  return { ok: true, message: "Invoice recorded." };
}

export async function recordEvidence(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "commissions:record");
  const parsed = evidenceSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  const amount = parseMajorToMinor(v.amount, v.currency);
  const fee = v.processingFee ? parseMajorToMinor(v.processingFee, v.currency) : 0;
  if (!amount || fee === null) return { ok: false, error: "Enter valid amounts.", fieldErrors: { amount: ["Enter a valid amount"] } };
  const { error } = await ctx.db.rpc("record_payment_evidence", {
    p_placement: v.placementId, p_kind: v.kind, p_amount_minor: amount, p_processing_fee_minor: fee,
    p_occurred_on: v.occurredOn, p_reference: v.reference, p_notes: v.notes ?? "", p_idempotency_key: v.idempotencyKey,
  });
  if (error) return toActionError(error);
  revalidatePath(`/w/${orgSlug}/commissions/${v.placementId}`);
  return { ok: true, message: "Evidence recorded. It affects the ledger only after independent verification." };
}

/** Works from an org workspace (sourcing org confirming a payout) or from the platform admin area. */
export async function reviewEvidence(input: { evidenceId: string; approve: boolean; note: string; orgSlug?: string; placementId?: string }): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const db = input.orgSlug ? (await getRequestContext(input.orgSlug)).db : await createClient();
  const { error } = await db.rpc("review_payment_evidence", { p_evidence: input.evidenceId, p_approve: input.approve, p_note: input.note });
  if (error) return toActionError(error);
  if (input.orgSlug && input.placementId) revalidatePath(`/w/${input.orgSlug}/commissions/${input.placementId}`);
  revalidatePath("/admin");
  return { ok: true, message: input.approve ? "Verified. Ledger updated." : "Evidence rejected." };
}

export async function openDispute(orgSlug: string, input: { placementId: string; reason: string }): Promise<ActionResult> {
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "commissions:read");
  if (input.reason.trim().length < 10) return { ok: false, error: "Describe the issue (at least 10 characters)." };
  const { error } = await ctx.db.rpc("open_dispute", { p_placement: input.placementId, p_reason: input.reason.trim() });
  if (error) return toActionError(error);
  revalidatePath(`/w/${orgSlug}/commissions/${input.placementId}`);
  return { ok: true, message: "Dispute opened. The placement is frozen pending platform review." };
}
