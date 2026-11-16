import { z } from "zod";
import { I18N_PREFIX, msg } from "@/i18n/translate";
import type en from "@/i18n/messages/en";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
      /** Stable server error code (N10 codes, spec §5.16) so a screen can pick its context-specific copy. */
      code?: string;
      /** Error DETAIL from the database when it's safe structured data (e.g. N10 marker lines, deadlines). */
      detail?: string;
      /** N3 v2.1: where the refusal points (e.g. `hire_already_recorded` → the placement the caller can already open). */
      target?: { placementId?: string | null; referralId?: string };
    };

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
  "not_pipeline_owner", "candidate_email_missing", "request_closed", "request_expired",
  // N1 duplicate and prior-presentation protection
  "not_found", "identifier_required", "claim_window_closed", "claim_already_filed", "claim_not_allowed",
  "claim_files_not_ready", "claim_referral_invalid", "claim_file_invalid", "claim_too_many_files",
  "claim_attestation_required", "claim_date_invalid", "claim_evidence_invalid", "claim_note_too_long",
  "contest_window_closed", "dispute_already_open", "release_not_allowed", "invalid_dispute_kind",
  // N2 job terms card. Codes without a key (hire_base_invalid, fee_difference_not_allowed, fee_difference_note_too_long,
  // amendment_reason_required) map to errors.generic by design (spec §5.9: the UI validates first).
  "terms_incomplete", "referrals_require_permanent", "terms_attestation_required",
  // N2 drop 2 codes (keys present now so the copy ships once)
  "hire_terms_fixed", "fee_difference_reason_required", "amendment_after_hire", "amendment_window_after_delivery",
  "amendment_no_change", "amendment_legacy_referral", "terms_not_recorded",
  // N2 review (copy-review P16)
  "hire_terms_changed",
  // N3 drop 1 (referral-claims-two-sided-hire). hire_dates_invalid and note_too_long map to errors.generic by
  // design: the forms validate them first (field errors).
  "hire_not_eligible", "objection_open", "placement_fee_pending", "client_name_required_for_referrals",
  // N3 drop 2. hire_report_invalid, hire_contest_invalid, hire_rebuttal_invalid, hire_report_tail_required,
  // auth_check_invalid, auth_check_closed, auth_check_not_available, auth_check_already_open, hire_evidence_invalid,
  // hire_evidence_too_many, hire_admin_fields_invalid and hire_decision_invalid map to errors.generic by design
  // (the forms validate first, or the action maps them to field errors).
  "hire_report_unavailable", "hire_report_rate_limited", "hire_report_files_not_ready", "hire_report_answer_closed",
  "hire_rebuttal_closed", "auth_check_already_requested",
];

/**
 * N10 server codes → default message keys (spec §5.16). The keys live in the `network` / `admin`
 * namespaces the frontend adds; the marker is built untyped on purpose so this file doesn't depend on
 * them (translateMarked shows the key itself until it exists). Screens with a context-specific key
 * switch on `code`.
 */
export const N10_ERROR_KEYS: Record<string, string> = {
  rules_acceptance_required: "network.errors.acceptanceRequired",
  rules_version_changed: "network.accept.versionChanged",
  partner_activity_restricted: "network.errors.partnerActivityRestricted",
  settlement_mode_unavailable: "network.errors.settlementUnavailable",
  report_self: "network.report.errors.self",
  report_rate_limited_user: "network.report.errors.userLimitNoSupport",
  report_rate_limited_org: "network.report.errors.orgLimitNoSupport",
  conduct_reply_closed: "network.reports.replyClosed",
  conduct_response_closed: "network.case.errors.closed",
  conduct_response_exists: "network.case.errors.exists",
  review_already_requested: "network.case.errors.reviewExists",
  review_window_closed: "network.case.errors.reviewClosed",
  last_admin: "network.team.lastAdmin",
  self_change: "onboarding.errors.selfChange",
  upcoming_exists: "admin.networkRules.upcomingExists",
  missing_locale: "admin.networkRules.errors.missingLocale",
  marker_found: "admin.networkRules.errors.marker",
  effective_date: "admin.networkRules.errors.effective",
  label_taken: "admin.networkRules.errors.labelTaken",
  conduct_date_before_rules: "admin.conduct.notice.conductDateBeforeRules",
  conduct_date_future: "network.report.errors.dateFuture",
  sanction_notice_required: "admin.conduct.decideLocked",
  sanction_reason_required: "admin.conduct.errors.reasonRequired",
  no_sanction_not_allowed: "admin.conduct.errors.noSanctionNotAllowed",
  decision_rules_not_in_notice: "admin.conduct.decision.rulesFromNotice",
  immediate_hold_ground_invalid: "admin.conduct.errors.groundInvalid",
  org_already_restricted: "admin.conduct.errors.alreadyRestricted",
  review_not_allowed: "admin.conduct.review.selfBlocked",
  review_cannot_increase: "admin.conduct.errors.cannotIncrease",
  lift_not_allowed: "admin.orgDetail.errors.liftNotAllowed",
  not_stale: "admin.orgDetail.errors.notStale",
  not_terminated: "admin.orgDetail.errors.notTerminated",
};
// Prefix matching: longer codes first so e.g. "conduct_response_exists" never matches a shorter code.
const N10_CODES = Object.keys(N10_ERROR_KEYS).sort((a, b) => b.length - a.length);
// Other N10 codes have no dedicated copy: they keep `code` and show the generic error (the UI validates first).
const N10_GENERIC = [
  "rule_numbers_mismatch", "initial_exists", "initial_required", "approval_reference_required", "legal_reason_required",
  "invalid_label", "invalid_type", "invalid_locale", "invalid_language", "conduct_category_invalid", "conduct_text_invalid",
  "conduct_attestation_required", "conduct_file_invalid", "conduct_files_not_ready", "conduct_too_many_files",
  "conduct_deadline_invalid", "conduct_reason_invalid", "conduct_outcome_invalid", "conduct_level_invalid",
  "conduct_date_required", "notice_version_invalid", "notice_rule_not_in_version", "admin_category_required",
  "incident_not_allowed", "incident_recipient_invalid",
];
const n10Marker = (key: string) => `${I18N_PREFIX}${key}`;

export function toActionError(error: unknown): ActionResult<never> {
  const raw = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
  const details = error && typeof error === "object" && "details" in error ? String((error as { details: unknown }).details ?? "") : "";
  if (raw.startsWith("rate_limited")) return { ok: false, error: msg("errors.rateLimited") };
  const n10 = N10_CODES.find((k) => raw === k || raw.startsWith(`${k}:`) || raw.startsWith(k));
  if (n10) return { ok: false, error: n10Marker(N10_ERROR_KEYS[n10]), code: n10, ...(details ? { detail: details.slice(0, 4000) } : {}) };
  const generic = N10_GENERIC.find((k) => raw === k || raw.startsWith(k));
  if (generic) return { ok: false, error: msg("errors.generic"), code: generic, ...(details ? { detail: details.slice(0, 4000) } : {}) };
  const code = CODES.find((k) => raw.startsWith(k) || raw.includes(`${k}:`) || raw === k);
  if (code) return { ok: false, error: msg(`errors.${code}`) };
  if (raw.includes("row-level security") || raw.includes("permission denied")) return { ok: false, error: msg("errors.forbidden") };
  if (raw.includes("duplicate key")) return { ok: false, error: msg("errors.alreadyExists") };
  console.error(JSON.stringify({ evt: "action.error", message: raw.slice(0, 200) }));
  return { ok: false, error: msg("errors.generic") };
}
