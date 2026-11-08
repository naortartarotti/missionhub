import { z } from "zod";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export const initialActionState: ActionResult<never> | null = null;

export function fromZodError(error: z.ZodError): ActionResult<never> {
  return {
    ok: false,
    error: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
  };
}

/** Maps database/RPC error codes to safe, human messages. Never echo raw DB errors to users. */
const MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  unauthenticated: "Please sign in again.",
  slug_taken: "That workspace URL is already taken.",
  invitation_invalid: "This invitation is no longer valid.",
  invitation_expired: "This invitation has expired. Ask an admin for a new one.",
  invitation_email_mismatch: "This invitation was sent to a different email address.",
  candidate_not_active: "The candidate must be active for matching before they can be submitted.",
  job_not_open_for_referrals: "This job is no longer open to referrals.",
  sharing_authorization_missing: "Record the candidate's authorization to share with this recipient for this job first.",
  invalid_disclosure_fields: "Select at least one field to share.",
  duplicate_referral: "This candidate has already been submitted to this job.",
  document_not_shareable: "One of the selected documents hasn't passed the security scan yet.",
  stale_version: "This record changed in the meantime. Refresh and try again.",
  invalid_transition: "That status change isn't allowed from the current stage.",
  reason_required: "Please provide a reason.",
  agreement_required: "Both parties must confirm the collaboration agreement first.",
  agreement_not_pending: "The agreement is not awaiting confirmation.",
  invalid_fee: "Enter a valid placement fee.",
  placement_locked: "This placement can't be changed in its current state.",
  invoice_required: "Record the client invoice before reporting a payment.",
  commission_not_payable: "Commission becomes payable only after the client payment is verified.",
  four_eyes_required: "Evidence must be verified by someone other than the person who recorded it.",
  already_reviewed: "This evidence has already been reviewed.",
  payout_exceeds_balance: "The payout exceeds the outstanding balance.",
  remittance_exceeds_balance: "The remittance exceeds the outstanding platform balance.",
  dispute_not_open: "This dispute is not open.",
  owner_not_member: "The owner must be an active member of this organization.",
  tenant_mismatch: "That record doesn't belong to this organization.",
  immutable_record: "This record is immutable. Record a correcting entry instead.",
};

export function toActionError(error: unknown): ActionResult<never> {
  const raw = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
  const code = Object.keys(MESSAGES).find((k) => raw.startsWith(k) || raw.includes(`${k}:`) || raw === k);
  if (code) return { ok: false, error: MESSAGES[code] };
  if (raw.includes("row-level security") || raw.includes("permission denied")) return { ok: false, error: MESSAGES.forbidden };
  if (raw.includes("duplicate key")) return { ok: false, error: "That already exists." };
  console.error(JSON.stringify({ evt: "action.error", message: raw.slice(0, 200) }));
  return { ok: false, error: "Something went wrong. Please try again." };
}
