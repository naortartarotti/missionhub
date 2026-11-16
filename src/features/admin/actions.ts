"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/server/supabase/server";
import { getSessionUser } from "@/server/auth/context";
import { AuthorizationError } from "@/server/auth/errors";
import { guard, id, parse, rateLimit, text } from "@/server/actions/guard";
import { createAdminClient } from "@/server/supabase/admin";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { msg } from "@/i18n/translate";
import { DEFAULT_COMMISSION_RULE_NAME } from "@/lib/labels";
import { parseMajorToMinor } from "@/lib/money/format";
import { getAdminReferralTerms } from "./queries";
import { FEE_BASES, FLAT_FEE_CURRENCIES, GUARANTEE_DAYS, GUARANTEE_REMEDIES, MAX_FEE_MINOR, SEARCH_TYPES, parseRateToBps } from "@/lib/money/terms";

/** Platform-admin gate. The RPCs re-check app.is_platform_admin() in the database. */
async function adminDb() {
  const user = await getSessionUser();
  if (!user?.isPlatformAdmin) throw new AuthorizationError();
  return createClient();
}

// N10 (BR-29, N10-D15): set_organization_suspension and setSuspension are gone. Suspension and termination
// exist only through the sanction ladder (src/features/network-rules/admin-actions.ts).

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

const claimDisputeSchema = z.object({ disputeId: id, claimUpheld: z.boolean(), resolution: text(5, 2000, msg("admin.validation.resolution")) });

/** Resolves a prior-presentation dispute (BR-18): uphold the claim (decline stands) or reject it (back to review). */
export async function resolvePriorPresentationDispute(input: { disputeId: string; claimUpheld: boolean; resolution: string }): Promise<ActionResult> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(claimDisputeSchema, input);
    const { error } = await db.rpc("resolve_prior_presentation_dispute", { p_dispute: v.disputeId, p_claim_upheld: v.claimUpheld, p_resolution: v.resolution });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    return { ok: true, message: msg(v.claimUpheld ? "admin.messages.claimUpheld" : "admin.messages.claimRejected") };
  });
}

export type ContactMatch = "match" | "no_match" | "not_available";

/** "Same person" signal for referral-evidence disputes (PD-024): per channel, never values. Audited. */
export async function compareDisputeContacts(disputeId: string): Promise<ActionResult<{ email: ContactMatch; phone: ContactMatch; linkedin: ContactMatch }>> {
  return guard(async () => {
    const db = await adminDb();
    parse(id, disputeId);
    const { data, error } = await db.rpc("compare_dispute_contacts", { p_dispute: disputeId });
    if (error || !data) return toActionError(error);
    return { ok: true, data: data as unknown as { email: ContactMatch; phone: ContactMatch; linkedin: ContactMatch } };
  });
}

/** Evidence download for a disputed claim (PD-024): 60-second signed URL after a passed scan, audited. */
export async function getAdminClaimEvidenceUrl(fileId: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const db = await adminDb();
    parse(id, fileId);
    await rateLimit(db, "document.url", 120, 600);
    const { data: path, error } = await db.rpc("authorize_claim_evidence", { p_file: fileId });
    if (error || !path) return toActionError(error ?? { message: "not_found" });
    const { data, error: sErr } = await createAdminClient().storage.from("claim-evidence").createSignedUrl(path, 60, { download: true });
    if (sErr || !data) return toActionError(sErr);
    return { ok: true, data: { url: data.signedUrl } };
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
      p_name: v.name || DEFAULT_COMMISSION_RULE_NAME,
      p_sourcing: v.sourcing,
      p_job_owner: v.jobOwner,
      p_platform: v.platform,
    });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    return { ok: true, message: msg("admin.messages.rulePublished") };
  });
}


/**
 * N2 concierge amendment (BR-34, BR-35, S10). FormData names follow the job form card fields
 * (feeBasis, feeRate, minimumFee, flatFee, flatCurrency, searchType, guaranteeDays, guaranteeRemedy,
 * paymentTermsDays, ownershipMonths) plus referralId, reason (10–1,000), hiringRequestReference and
 * sourcingRequestReference (3–200 each), bothRequested ("on"), and on a % basis expectedPctCurrency (the
 * `pct_amendment_currency` the admin saw, QA-N2-12). Amounts are in major units of flatCurrency on a flat
 * basis, else of the lookup's `pct_amendment_currency` (F-1). A posted `currency` is ignored.
 */
const amendSchema = z
  .object({
    referralId: id,
    // Derived on the server (flatCurrency on flat, else pct_amendment_currency); checked in the transform so a
    // missing flatCurrency reports on `flatCurrency`, the field the form renders (QA-N2-10).
    currency: z.string().trim().toUpperCase().optional(),
    feeBasis: z.enum(FEE_BASES),
    feeRate: z.string().trim().optional(),
    minimumFee: z.string().trim().optional(),
    flatFee: z.string().trim().optional(),
    flatCurrency: z.enum(FLAT_FEE_CURRENCIES).optional().or(z.literal("")).transform((v) => v || null),
    searchType: z.enum(SEARCH_TYPES),
    guaranteeDays: z.coerce.number().int().refine((d) => (GUARANTEE_DAYS as readonly number[]).includes(d), msg("jobs.errors.termsIncomplete")),
    guaranteeRemedy: z.enum(GUARANTEE_REMEDIES).optional().or(z.literal("")).transform((v) => v || null),
    paymentTermsDays: z.coerce.number().int().min(0, msg("jobs.validation.paymentDaysRange")).max(90, msg("jobs.validation.paymentDaysRange")),
    ownershipMonths: z.coerce.number().int().min(6).max(12),
    // Spec §5.8 copy for these fields (was the generic dispute-reason message).
    reason: text(10, 1000, msg("admin.referralTerms.validation.reasonLength")),
    hiringRequestReference: text(3, 200, msg("admin.referralTerms.validation.requestLength")),
    sourcingRequestReference: text(3, 200, msg("admin.referralTerms.validation.requestLength")),
    bothRequested: z.literal("on", { message: msg("admin.referralTerms.validation.bothAskedRequired") }),
  })
  .transform((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    let rateBps: number | null = null;
    let flatFeeMinor: number | null = null;
    let minFeeMinor: number | null = null;
    if (v.feeBasis === "flat") {
      if (!v.flatCurrency) issue("flatCurrency", msg("jobs.errors.termsIncomplete"));
      flatFeeMinor = v.flatFee ? parseMajorToMinor(v.flatFee, v.flatCurrency ?? "CAD") : null;
      if (!flatFeeMinor || flatFeeMinor > MAX_FEE_MINOR) issue("flatFee", msg("jobs.validation.flatAmountRequired"));
    } else if (!v.currency || !/^[A-Z]{3}$/.test(v.currency)) {
      issue("feeBasis", msg("errors.terms_incomplete"));
    } else {
      rateBps = parseRateToBps(v.feeRate);
      if (rateBps === null) issue("feeRate", msg("jobs.validation.feeRateRange"));
      if (v.minimumFee) {
        minFeeMinor = parseMajorToMinor(v.minimumFee, v.currency);
        if (!minFeeMinor || minFeeMinor > MAX_FEE_MINOR) issue("minimumFee", msg("jobs.validation.minimumPositive"));
      }
    }
    const remedy = v.guaranteeDays === 0 ? null : v.guaranteeRemedy;
    if (v.guaranteeDays !== 0 && !remedy) issue("guaranteeRemedy", msg("jobs.validation.remedyRequired"));
    return { ...v, rateBps, flatFeeMinor, minFeeMinor, remedy };
  });

/** QA-N2-12: the hidden `expectedPctCurrency` field (the lookup's pct_amendment_currency at page load). */
const expectedCurrencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

export async function amendReferralTerms(_: ActionResult | null, formData: FormData): Promise<ActionResult<{ versionId: string }>> {
  return guard(async () => {
    const db = await adminDb();
    const raw = Object.fromEntries(formData);
    // F-1 (PD-062): amounts on a % basis are parsed in the currency the server will store: the effective
    // terms' currency when already %, else the job's salary currency. Never the posted `currency`.
    const referralId = parse(id, raw.referralId);
    const lookup = await getAdminReferralTerms(db, referralId);
    if (!lookup) return { ok: false, error: msg("errors.not_found") };
    // QA-N2-11: a legacy referral (no recorded terms) answers the same code on every basis, as the RPC does.
    if (!lookup.recorded) return { ok: false, error: msg("errors.amendment_legacy_referral") };
    const pct = raw.feeBasis !== "flat";
    if (pct && !lookup.pct_amendment_currency) return { ok: false, error: msg("errors.terms_incomplete") };
    // QA-N2-12: a % amendment must carry the currency the admin saw; missing or different = stale terms.
    const expected = pct ? expectedCurrencySchema.safeParse(raw.expectedPctCurrency) : null;
    if (expected && (!expected.success || expected.data !== lookup.pct_amendment_currency)) return { ok: false, error: msg("errors.stale_version") };
    const v = parse(amendSchema, { ...raw, currency: pct ? lookup.pct_amendment_currency : (raw.flatCurrency ?? "") });
    const { data, error } = await db.rpc("admin_amend_referral_terms", {
      p_referral: v.referralId,
      p_reason: v.reason,
      p_hiring_request_reference: v.hiringRequestReference,
      p_sourcing_request_reference: v.sourcingRequestReference,
      p_both_requested: true,
      p_fee_basis: v.feeBasis,
      p_search_type: v.searchType,
      p_guarantee_days: v.guaranteeDays,
      p_payment_terms_days: v.paymentTermsDays,
      p_ownership_months: v.ownershipMonths,
      p_rate_bps: v.rateBps ?? undefined,
      p_flat_fee_minor: v.flatFeeMinor ?? undefined,
      p_min_fee_minor: v.minFeeMinor ?? undefined,
      p_flat_currency: v.feeBasis === "flat" ? (v.flatCurrency ?? undefined) : undefined,
      p_guarantee_remedy: v.remedy ?? undefined,
      // QA-N2-12: the RPC re-checks against the currency it would store, in the same transaction.
      p_expected_currency: expected?.success ? expected.data : undefined,
    });
    if (error) return toActionError(error);
    revalidatePath(`/admin/referrals/${v.referralId}`);
    return { ok: true, data: { versionId: data as string }, message: msg("admin.referralTerms.messages.recorded") };
  });
}

const hireNoteSchema = z.object({ referralId: id, note: z.string().max(2000, msg("errors.invalidFields")) });

/** N3 BR-12 (rev. 2): the platform admin's note on a hire record (e.g. a related-org hire). Empty clears it. */
export async function saveHireRecordNote(input: { referralId: string; note: string }): Promise<ActionResult> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(hireNoteSchema, input);
    const { error } = await db.rpc("admin_set_hire_record_note", { p_referral: v.referralId, p_note: v.note });
    if (error) return toActionError(error);
    revalidatePath(`/admin/referrals/${v.referralId}`);
    return { ok: true, message: msg("admin.hireRecord.noteSaved") };
  });
}

const feeNoticeSchema = z.object({ placementId: id, sentOn: z.iso.date(), note: z.string().trim().max(2000).optional() });

/** N3 BR-31: records that the rule 6.4 notice for overdue fee details was sent (date + optional note). */
export async function recordFeeNotice(input: { placementId: string; sentOn: string; note?: string }): Promise<ActionResult> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(feeNoticeSchema, input);
    const { error } = await db.rpc("admin_record_fee_notice", { p_placement: v.placementId, p_sent_on: v.sentOn, p_note: v.note || undefined });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    return { ok: true, message: msg("admin.hireReports.noticeSentLine", { date: v.sentOn }) };
  });
}

// ---------------------------------------------------------------------------------------------
// N3 drop 2: hire-report decisions, admin fields, authorization checks, evidence downloads.

const decideSchema = z.object({
  reportId: id,
  outcome: z.enum(["upheld", "rejected"]),
  resolution: text(20, 2000, msg("admin.validation.resolutionLong")),
  finding: z.enum(["not_hired", "outside_window", "different_person", "not_this_client"]).optional(),
}).refine((v) => v.outcome === "upheld" ? !v.finding : !!v.finding, { path: ["finding"], message: msg("errors.invalidFields") });

/** BR-27: uphold (fee-pending placement, or recorded without a split) or reject with a finding. No amounts. */
export async function decideHireReport(input: { reportId: string; outcome: "upheld" | "rejected"; resolution: string; finding?: string }): Promise<ActionResult<{ placementId: string | null }>> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(decideSchema, input);
    const { data, error } = await db.rpc("admin_decide_hire_report", { p_report: v.reportId, p_outcome: v.outcome, p_resolution: v.resolution, p_finding: v.finding });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    return { ok: true, data: { placementId: (data as { placement_id: string | null }).placement_id } };
  });
}

const fieldsSchema = z.object({
  reportId: id,
  candidateContacts: z.number().int().min(0).max(5),
  clientConfirmation: z.enum(["not_requested", "requested", "provided", "refused"]),
  note: z.string().max(2000).default(""),
});

/** BR-28: candidate contacted (0–5), client's written confirmation, internal note. Admin-only, audited. */
export async function saveHireReportFields(input: { reportId: string; candidateContacts: number; clientConfirmation: string; note?: string }): Promise<ActionResult> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(fieldsSchema, input);
    const { error } = await db.rpc("admin_set_hire_report_fields", { p_report: v.reportId, p_candidate_contacts: v.candidateContacts, p_client_confirmation: v.clientConfirmation, p_note: v.note });
    if (error) return toActionError(error);
    revalidatePath(`/admin/hire-reports/${v.reportId}`);
    return { ok: true };
  });
}

const openCheckSchema = z.object({ referralId: id, requestedBy: z.enum(["submitter", "candidate", "hiring_side"]), challengerEvidence: z.boolean().default(false) });

/** BR-37: opens an authorization check; an evidence request goes to A when a recent-change note exists or the challenger brought evidence. */
export async function openAuthorizationCheck(input: { referralId: string; requestedBy: string; challengerEvidence?: boolean }): Promise<ActionResult<{ id: string; evidenceDueAt: string | null }>> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(openCheckSchema, input);
    const { data, error } = await db.rpc("admin_open_authorization_check", { p_referral: v.referralId, p_requested_by: v.requestedBy, p_challenger_evidence: v.challengerEvidence });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    const out = data as { id: string; evidence_due_at: string | null };
    return { ok: true, data: { id: out.id, evidenceDueAt: out.evidence_due_at } };
  });
}

const decideCheckSchema = z.object({ checkId: id, valid: z.boolean(), resolution: text(20, 2000, msg("admin.validation.resolutionLong")), candidateContacted: z.boolean().default(false) });

/** BR-37: valid closes the check; invalid voids the presentation (never automatic). */
export async function decideAuthorizationCheck(input: { checkId: string; valid: boolean; resolution: string; candidateContacted?: boolean }): Promise<ActionResult> {
  return guard(async () => {
    const db = await adminDb();
    const v = parse(decideCheckSchema, input);
    const { error } = await db.rpc("admin_decide_authorization_check", { p_check: v.checkId, p_valid: v.valid, p_resolution: v.resolution, p_candidate_contacted: v.candidateContacted });
    if (error) return toActionError(error);
    revalidatePath("/admin", "layout");
    return { ok: true };
  });
}

/** 60-second signed URL for any hire-report / contest / rebuttal / auth-check file (platform admin, audited). */
export async function getAdminHireEvidenceUrl(fileId: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const db = await adminDb();
    parse(id, fileId);
    await rateLimit(db, "document.url", 120, 600);
    const { data: path, error } = await db.rpc("authorize_hire_evidence", { p_file: fileId });
    if (error || !path) return toActionError(error ?? { message: "not_found" });
    const { data, error: sErr } = await createAdminClient().storage.from("hire-evidence").createSignedUrl(path, 60, { download: true });
    if (sErr || !data) return toActionError(sErr);
    return { ok: true, data: { url: data.signedUrl } };
  });
}
