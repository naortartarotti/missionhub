import { z } from "zod";
import { msg } from "@/i18n/translate";
import type en from "@/i18n/messages/en";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export const initialActionState: ActionResult<never> | null = null;

export function fromZodError(error: z.ZodError): ActionResult<never> {
  return {
    ok: false,
    error: msg("errors.invalidFields"),
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
  };
}

/** Database/RPC error codes that have a human message in `errors.<code>`. Never echo raw DB errors to users. */
type ErrorCode = Exclude<keyof typeof en.errors, "page" | "notFound">;
const CODES: ErrorCode[] = [
  "forbidden", "unauthenticated", "slug_taken", "invitation_invalid", "invitation_expired", "invitation_email_mismatch",
  "candidate_not_active", "job_not_open_for_referrals", "sharing_authorization_missing", "invalid_disclosure_fields",
  "duplicate_referral", "document_not_shareable", "stale_version", "invalid_transition", "reason_required",
  "agreement_required", "agreement_not_pending", "invalid_fee", "placement_locked", "invoice_required",
  "commission_not_payable", "four_eyes_required", "already_reviewed", "payout_exceeds_balance",
  "remittance_exceeds_balance", "dispute_not_open", "owner_not_member", "tenant_mismatch", "immutable_record",
  "insufficient_funds", "wallet_frozen", "wallet_transfers_disabled", "wallet_cashouts_disabled",
  "payout_destination_required", "nothing_to_pay", "invalid_recipient", "invalid_amount",
  "not_pipeline_owner", "candidate_email_missing", "request_closed", "request_expired",
];

export function toActionError(error: unknown): ActionResult<never> {
  const raw = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
  const code = CODES.find((k) => raw.startsWith(k) || raw.includes(`${k}:`) || raw === k);
  if (code) return { ok: false, error: msg(`errors.${code}`) };
  if (raw.includes("row-level security") || raw.includes("permission denied")) return { ok: false, error: msg("errors.forbidden") };
  if (raw.includes("duplicate key")) return { ok: false, error: msg("errors.alreadyExists") };
  console.error(JSON.stringify({ evt: "action.error", message: raw.slice(0, 200) }));
  return { ok: false, error: msg("errors.generic") };
}
