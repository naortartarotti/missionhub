"use server";

import { randomUUID } from "node:crypto";
import { guard, id, parse, rateLimit } from "@/server/actions/guard";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { createAdminClient } from "@/server/supabase/admin";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { msg } from "@/i18n/translate";
import { formToObject } from "@/lib/validation/form-data";
import { listOpportunities, partnerTerms, type PartnerTerms } from "@/features/matching/queries";
import { getReferralHireState, getReferralTerms } from "./queries";
import { parseHireMoney } from "./hire-money";
import type { Database } from "@/server/db/database.types";
import { CANDIDATE_REQUEST_TTL_DAYS, emailCandidateRequest } from "./candidate-request";
import { env } from "@/server/env";
import { getFormatter, getLocale } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import {
  CLAIM_EVIDENCE_MAX_BYTES,
  CLAIM_EVIDENCE_TYPES,
  bulkDeclineSchema,
  claimEvidenceFileSchema,
  contestSchema,
  fileClaimRpcArgs,
  fileClaimSchema,
  hireCommonFields,
  hireDateWindow,
  messageSchema,
  releaseSchema,
  reportHireSchema,
  reviewSchema,
  submitReferralSchema,
  transitionSchema,
  withdrawSchema,
} from "./schemas";

/**
 * Outcome of a submission that didn't create a referral (N1, EC-1). These are results, not errors:
 * the composer renders them as states. `stopped` has the same shape in every case (job- or
 * client-level hit, own or other org, sticky stop); `reference` is opaque (PD-025).
 * `created` never appears here: it redirects to the referral page as before.
 */
export type SubmitOutcome =
  | { outcome: "stopped"; reference: string; supportEmail: string | null }
  | { outcome: "pending_warning" }
  | { outcome: "identifier_required" }
  // N2 (BR-12): the version posted isn't the job's current one. Nothing was created; `terms` is the
  // current card to re-render (with "Changed" badges against the one the form showed).
  | { outcome: "terms_changed"; terms: PartnerTerms };

export async function submitReferral(orgSlug: string, _: ActionResult<SubmitOutcome> | null, formData: FormData): Promise<ActionResult<SubmitOutcome>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "referrals:submit");
    // The 30/h `referral.submit` limit is enforced inside both submit RPCs (every attempt counts,
    // stops, warnings and identifier refusals included, BR-22), so direct PostgREST calls are limited too.
    const parsed = submitReferralSchema.safeParse(formToObject(formData, ["fields", "documentIds"]));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;

    // Resolve candidate & job from the authorized projection, never from client-supplied ids.
    const [opp] = await listOpportunities(ctx, { matchId: v.matchId });
    if (!opp) return { ok: false, error: msg("referrals.errors.opportunityGone") };

    const notCreated = async (outcome: string, reference: string | null): Promise<ActionResult<SubmitOutcome> | null> => {
      if (outcome === "terms_changed") {
        // Re-read through the same authorized projection; the job may also have stopped being visible.
        const [fresh] = await listOpportunities(ctx, { matchId: v.matchId });
        if (!fresh) return { ok: false, error: msg("referrals.errors.opportunityGone") };
        return { ok: true, data: { outcome: "terms_changed", terms: partnerTerms(fresh) } };
      }
      if (outcome === "stopped") return { ok: true, data: { outcome: "stopped", reference: reference ?? "", supportEmail: env.SUPPORT_EMAIL ?? null } };
      if (outcome === "pending_warning") return { ok: true, data: { outcome: "pending_warning" } };
      if (outcome === "identifier_required") return { ok: true, data: { outcome: "identifier_required" } };
      // Any other non-created outcome is a stable error code returned (not raised) by the RPC, so the
      // attempt stays counted (R2-1): `conflict`, `failed` or a precondition code. (N9 removed
      // `invalid_token`: no RPC accepts a caller-supplied token hash any more.)
      if (outcome !== "created") return toActionError({ message: outcome });
      return null;
    };

    if (v.authMethod === "candidate_email") {
      // The referral waits in "awaiting_candidate", invisible to the partner, until the candidate
      // confirms through the private link emailed here. Confirming delivers it automatically.
      // N9: the request is created without a usable token; emailCandidateRequest has the database
      // issue it (service-role RPC) and puts it only in the candidate's email.
      const { data, error } = await ctx.db
        .rpc("submit_referral_for_candidate", {
          p_candidate: opp.candidate_id,
          p_job: opp.job_id,
          p_fields: v.fields,
          p_document_ids: v.documentIds,
          p_idempotency_key: v.idempotencyKey,
          p_terms_version: v.termsVersionId,
          p_note: v.note || undefined,
          p_ttl_days: CANDIDATE_REQUEST_TTL_DAYS,
          p_acknowledge_pending: v.acknowledgePendingWarning,
        })
        .single();
      if (error || !data) return toActionError(error);
      const early = await notCreated(data.outcome, data.reference);
      if (early) return early;
      let flag = "awaiting";
      // A replayed submission (same idempotency key) already emailed its own link.
      if (data.created && data.destination && data.referral_id) {
        const r = await emailCandidateRequest(ctx, { referralId: data.referral_id, to: data.destination, jobTitle: opp.job_title, partner: opp.job_org_name, candidateName: opp.candidate_name });
        if (!r.sent) flag = "notSent";
      }
      revalidatePath(`/workspace/${orgSlug}/opportunities`);
      revalidatePath(`/workspace/${orgSlug}/referrals`);
      redirect(`/workspace/${orgSlug}/referrals/${data.referral_id}?${flag}=1`);
    }

    // A new authorization is recorded by the RPC itself, after the duplicate check, so a stop
    // leaves nothing behind (spec 2.1 backend note).
    const existingConsent = v.consentId && v.consentId !== "new" ? v.consentId : null;
    if (existingConsent) parse(id, existingConsent);
    const { data, error } = await ctx.db
      .rpc("submit_referral", {
        p_candidate: opp.candidate_id,
        p_job: opp.job_id,
        p_fields: v.fields,
        p_document_ids: v.documentIds,
        p_consent: existingConsent as string,
        p_idempotency_key: v.idempotencyKey,
        p_terms_version: v.termsVersionId,
        p_note: v.note || undefined,
        p_acknowledge_pending: v.acknowledgePendingWarning,
        p_new_consent: existingConsent
          ? undefined
          : {
              legal_basis: v.newConsentBasis,
              scope: `Share the selected profile fields${v.documentIds.length ? " and documents" : ""} with ${opp.job_org_name} for "${opp.job_title}"`.slice(0, 1000),
              evidence: v.newConsentEvidence ?? "",
            },
      })
      .single();
    if (error || !data) return toActionError(error);
    const early = await notCreated(data.outcome, data.reference);
    if (early) return early;
    revalidatePath(`/workspace/${orgSlug}/opportunities`);
    revalidatePath(`/workspace/${orgSlug}/referrals`);
    redirect(`/workspace/${orgSlug}/referrals/${data.referral_id}?submitted=1`);
  });
}

export async function transitionReferral(orgSlug: string, input: { referralId: string; to: string; reason?: string; version: number }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    const parsed = transitionSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    assertCan(ctx, parsed.data.to === "withdrawn" || parsed.data.to === "under_review" ? "referrals:submit" : "referrals:review");
    const { error } = await ctx.db.rpc("transition_referral", {
      p_referral: parsed.data.referralId,
      p_to: parsed.data.to,
      p_reason: parsed.data.reason,
      p_expected_version: parsed.data.version,
      p_acting_org: ctx.organizationId,
    });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/referrals/${parsed.data.referralId}`);
    revalidatePath(`/workspace/${orgSlug}/referrals`);
    return { ok: true, message: msg("referrals.success.statusUpdated") };
  });
}

/** One queue decision (accept / decline with reason code / ask for info / mark in review). */
export async function reviewReferral(
  orgSlug: string,
  input: { referralId: string; to: string; reasonCode?: string; note?: string; version: number },
): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;
    const { error } = await ctx.db.rpc("review_referral", {
      p_referral: v.referralId,
      p_to: v.to,
      p_reason_code: v.reasonCode ?? "",
      p_note: v.note,
      p_expected_version: v.version,
      p_acting_org: ctx.organizationId,
    });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/referrals`);
    revalidatePath(`/workspace/${orgSlug}/referrals/${v.referralId}`);
    return { ok: true, message: msg(`referrals.queue.done.${v.to}`) };
  });
}

/** Declines several pending referrals with one reason. Ones that changed meanwhile are skipped. */
export async function declineReferrals(orgSlug: string, input: { ids: string[]; reasonCode: string; note?: string }): Promise<ActionResult<{ count: number }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    const parsed = bulkDeclineSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    await rateLimit(ctx.db, "referral.bulk_decline", 30, 600);
    const { data, error } = await ctx.db.rpc("decline_referrals", { p_ids: parsed.data.ids, p_reason_code: parsed.data.reasonCode, p_note: parsed.data.note });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/referrals`);
    return { ok: true, data: { count: data ?? 0 }, message: msg("referrals.queue.done.bulk", { count: data ?? 0 }) };
  });
}

export async function sendReferralMessage(orgSlug: string, referralId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    const parsed = messageSchema.safeParse({ referralId, body: formData.get("body") });
    if (parsed.success) await rateLimit(ctx.db, "referral.message", 60, 600);
    if (!parsed.success) return fromZodError(parsed.error);
    const { data: ref } = await ctx.db.from("referrals").select("source_org_id, target_org_id").eq("id", referralId).maybeSingle();
    if (!ref) return { ok: false, error: msg("referrals.errors.notFound") };
    const side = ref.source_org_id === ctx.organizationId ? "source" : ref.target_org_id === ctx.organizationId ? "target" : null;
    if (!side) return { ok: false, error: msg("errors.forbidden") };
    const { error } = await ctx.db.from("referral_messages").insert({ referral_id: referralId, author_id: ctx.userId, author_side: side, body: parsed.data.body });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/referrals/${referralId}`);
    return { ok: true };
  });
}

export async function confirmAgreement(orgSlug: string, referralId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:submit");
    parse(id, referralId);
    const { error } = await ctx.db.rpc("confirm_agreement", { p_referral: referralId });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/referrals/${referralId}`);
    return { ok: true, message: msg("referrals.success.agreementConfirmed") };
  });
}

/**
 * Outcome of a hire record that created no placement (N3 BR-9 flag off, BR-11 released). The dialog renders it
 * as a result state; a placement redirects to the placement page as before.
 */
export type HireOutcome = { outcome: "record_only"; noSplitReason: "released" | "no_agreement" };

/** Today's date in America/Toronto (YYYY-MM-DD), the calendar the RPC uses for date bounds. */
const todayEt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());

export async function reportHire(orgSlug: string, _: ActionResult<HireOutcome> | null, formData: FormData): Promise<ActionResult<HireOutcome>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "referrals:review");
    const parsed = reportHireSchema.safeParse(formToObject(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;
    // N3: the variant comes from the server (never the form). Anyone who can't act gets "not found".
    const state = await getReferralHireState(ctx, v.referralId);
    if (!state || state.side !== "target") return { ok: false, error: msg("referrals.errors.notFound") };
    if (state.variant === "objection_open") return { ok: false, error: msg("errors.objection_open") };
    if (!state.can_record) return { ok: false, error: msg("errors.hire_not_eligible") };
    // V1 (happy path) has no common fields (BR-7); a forged acceptance date or role there is still checked.
    const common = hireCommonFields(v, todayEt());
    // N3 v2 (frontend request, rev. 2.1): out-of-window dates are field errors, not a generic error.
    const win = hireDateWindow(state.delivered_at, todayEt());
    if (v.startDate < win.min || v.startDate > win.max) common.fieldErrors.startDate = [msg("errors.hire_dates_invalid")];
    if (common.offerAcceptedOn && common.offerAcceptedOn < win.min) common.fieldErrors.offerAcceptedOn = [msg("errors.hire_dates_invalid")];
    if (common.hiredRoleTitle && !state.other_role_allowed) return { ok: false, error: msg("errors.hire_not_eligible") };
    // The variant and the currency come from the referral's own terms (RLS read), never from the form.
    const terms = await getReferralTerms(ctx, v.referralId);
    if (!terms) return { ok: false, error: msg("referrals.errors.notFound") };
    const base = {
      p_referral: v.referralId, p_start_date: v.startDate, p_expected_version: v.version,
      p_offer_accepted_on: common.offerAcceptedOn ?? undefined, p_hired_role_title: common.hiredRoleTitle ?? undefined,
      p_report: v.reportId ?? undefined,  // N3 v2
    };

    let args: Database["public"]["Functions"]["report_hire"]["Args"] = base;
    if (state.variant !== "no_agreement") {
      // V4 (BR-9 flag off) has no fee fields: posted money is ignored. Every other variant takes the N2 fields,
      // released referrals included (validated like any other, then discarded by the RPC, BR-11).
      const money = parseHireMoney(terms, v);
      if (!money.ok) return { ...money, fieldErrors: { ...common.fieldErrors, ...money.fieldErrors } };
      args = { ...base, ...money.args };
    }
    if (Object.keys(common.fieldErrors).length) return { ok: false, error: msg("errors.invalidFields"), fieldErrors: common.fieldErrors };
    const { data: placementId, error } = await ctx.db.rpc("report_hire", args);
    if (error) {
      if (error.message?.startsWith("not_found")) return { ok: false, error: msg("referrals.errors.notFound") };
      if (error.message?.startsWith("hire_dates_invalid")) return { ok: false, error: msg("errors.invalidFields"), fieldErrors: { startDate: [msg("errors.hire_dates_invalid")] } };
      return toActionError(error);
    }
    revalidatePath(`/workspace/${orgSlug}/referrals/${v.referralId}`);
    if (placementId) redirect(`/workspace/${orgSlug}/commissions/${placementId}?created=1`);
    // A hire recorded without a split (V4 / V5): the reason is shown now, at record time (BR-11, RD-054).
    const after = await getReferralHireState(ctx, v.referralId);
    const reason = after?.hire_record?.no_split_reason ?? "no_agreement";
    return { ok: true, data: { outcome: "record_only", noSplitReason: reason } };
  });
}

/** Authorizes through RLS-aware RPC (audited), then signs a 60-second URL from the referral bucket. */
export async function getReferralDocumentUrl(orgSlug: string, grantId: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    parse(id, grantId);
    await rateLimit(ctx.db, "document.url", 120, 600);
    const { data: path, error } = await ctx.db.rpc("authorize_referral_document", { p_grant: grantId });
    if (error || !path) return toActionError(error ?? { message: "forbidden" });
    const { data, error: sErr } = await createAdminClient().storage.from("referral-documents").createSignedUrl(path, 60, { download: true });
    if (sErr || !data) return toActionError(sErr);
    return { ok: true, data: { url: data.signedUrl } };
  });
}

/** Sends the candidate a fresh private link (the previous one stops working). */
export async function resendCandidateRequest(orgSlug: string, referralId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:submit");
    parse(id, referralId);
    // The 10/h `referral.candidate_resend` limit is enforced inside rotate_candidate_request_token
    // (N9 BR-10), once per resend, so direct PostgREST calls count too.
    const { data: ref } = await ctx.db
      .from("referrals")
      .select("job_title_snapshot, target_org:organizations!referrals_target_org_id_fkey(name)")
      .eq("id", referralId)
      .eq("source_org_id", ctx.organizationId)
      .maybeSingle();
    if (!ref) return { ok: false, error: msg("referrals.errors.notFound") };
    // Kills the current link and re-arms the request (no usable token); the new token is issued
    // and emailed by emailCandidateRequest.
    const { data: to, error } = await ctx.db.rpc("rotate_candidate_request_token", { p_referral: referralId, p_ttl_days: CANDIDATE_REQUEST_TTL_DAYS });
    if (error || !to) return toActionError(error);
    const r = await emailCandidateRequest(ctx, { referralId, to, jobTitle: ref.job_title_snapshot, partner: ref.target_org?.name ?? "" });
    revalidatePath(`/workspace/${orgSlug}/referrals/${referralId}`);
    if (!r.sent) return { ok: false, error: msg(r.reason === "not_configured" ? "referrals.errors.emailNotConfigured" : "referrals.errors.candidateEmailFailed") };
    return { ok: true, message: msg("referrals.success.candidateEmailResent", { email: to }) };
  });
}

// ---------------------------------------------------------------------------------------------
// N1: withdraw with release, release later, prior-presentation claims and contests.
// Every action resolves the tenant from the session and passes ctx.organizationId as the acting
// org; the RPCs re-check the side and answer "not found" to the other side or another org.

/**
 * `claim_window_closed` / `contest_window_closed` carry the deadline in the error DETAIL (ISO UTC),
 * so the message can say when it passed (spec §5.8, `{when}` in ET). Everything else goes through
 * the usual safe mapping.
 */
async function deadlineAwareError(error: unknown): Promise<ActionResult<never>> {
  const e = (error ?? {}) as { message?: string; details?: string };
  const code = e.message?.startsWith("claim_window_closed") ? "claim_window_closed" : e.message?.startsWith("contest_window_closed") ? "contest_window_closed" : null;
  const at = e.details ? new Date(e.details) : null;
  if (code && at && !Number.isNaN(at.getTime())) {
    const when = new Intl.DateTimeFormat(INTL_LOCALE[await getLocale()], { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" }).format(at);
    return { ok: false, error: msg(`errors.${code}`, { when }) };
  }
  return toActionError(error);
}

const revalidateReferral = (orgSlug: string, referralId: string) => {
  revalidatePath(`/workspace/${orgSlug}/referrals/${referralId}`);
  revalidatePath(`/workspace/${orgSlug}/referrals`);
};

/** Withdraw (sourcing side). With `release`, also releases the candidate in the same transaction (BR-25). */
export async function withdrawReferral(orgSlug: string, input: { referralId: string; reason: string; version: number; release?: boolean }): Promise<ActionResult<{ version: number }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:submit");
    const v = parse(withdrawSchema, input);
    const { data, error } = await ctx.db.rpc("withdraw_referral", {
      p_referral: v.referralId,
      p_reason: v.reason,
      p_expected_version: v.version,
      p_release: v.release,
      p_acting_org: ctx.organizationId,
    });
    if (error) return toActionError(error);
    revalidateReferral(orgSlug, v.referralId);
    if (v.release) return { ok: true, data: { version: data }, message: msg("referrals.success.withdrawnReleased") };
    // "It keeps first position for this client until {date}" (ownership window end, America/Toronto).
    const { data: ref } = await ctx.db.from("referrals").select("ownership_protected_until").eq("id", v.referralId).eq("source_org_id", ctx.organizationId).maybeSingle();
    // Withdrawals happen after delivery, so the date is set; an undelivered referral has none (BR-19).
    const until = ref?.ownership_protected_until ? new Date(ref.ownership_protected_until) : null;
    const date = until
      ? new Intl.DateTimeFormat(INTL_LOCALE[await getLocale()], { timeZone: "America/Toronto", dateStyle: "medium" }).format(until)
      : "—";
    return { ok: true, data: { version: data }, message: msg("referrals.success.withdrawn", { date }) };
  });
}

/** Release later, on a referral that is already withdrawn or cancelled (BR-25, PD-021). Irreversible. */
export async function releaseReferral(orgSlug: string, input: { referralId: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:submit");
    const v = parse(releaseSchema, input);
    const { error } = await ctx.db.rpc("release_referral", { p_referral: v.referralId, p_acting_org: ctx.organizationId });
    if (error) return toActionError(error);
    revalidateReferral(orgSlug, v.referralId);
    return { ok: true, message: msg("referrals.success.released") };
  });
}

export type ClaimEvidenceFile = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  scan_status: "pending" | "clean" | "rejected";
  sha256: string | null;
};

/**
 * Uploads one evidence file for a claim not yet filed (hiring side). The object goes to the private
 * claim-evidence bucket with the user's own client (storage policy re-checks the org and that the
 * referral is claimable); the RPC then records it from the stored object's metadata and queues the
 * worker scan + SHA-256 (EC-4). Poll `getClaimEvidenceFiles` until `scan_status` leaves `pending`.
 */
export async function uploadClaimEvidence(orgSlug: string, referralId: string, _: ActionResult<ClaimEvidenceFile> | null, formData: FormData): Promise<ActionResult<ClaimEvidenceFile>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    parse(id, referralId);
    await rateLimit(ctx.db, "referral.claim_upload", 30, 3600);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: msg("errors.claim_file_invalid") };
    const ext = CLAIM_EVIDENCE_TYPES[file.type as keyof typeof CLAIM_EVIDENCE_TYPES];
    if (!ext || file.size > CLAIM_EVIDENCE_MAX_BYTES) return { ok: false, error: msg("errors.claim_file_invalid") };
    const path = `${ctx.organizationId}/${referralId}/${randomUUID()}.${ext}`;
    const { error: upErr } = await ctx.db.storage
      .from("claim-evidence")
      .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    // A refused upload means the referral isn't ours or isn't claimable: same answer either way.
    if (upErr) return { ok: false, error: msg("errors.claim_not_allowed") };
    const { data, error } = await ctx.db.rpc("register_claim_evidence", {
      p_referral: referralId,
      p_storage_path: path,
      p_file_name: file.name,
      p_acting_org: ctx.organizationId,
    });
    if (error || !data) {
      await createAdminClient().storage.from("claim-evidence").remove([path]); // our own just-uploaded object
      return deadlineAwareError(error);
    }
    return { ok: true, data: data as unknown as ClaimEvidenceFile };
  });
}

/** Draft evidence files (not yet filed) with their scan status and SHA-256, for polling. */
export async function getClaimEvidenceFiles(orgSlug: string, referralId: string): Promise<ActionResult<ClaimEvidenceFile[]>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    parse(id, referralId);
    const { data, error } = await ctx.db.rpc("list_claim_evidence_files", { p_referral: referralId, p_acting_org: ctx.organizationId });
    if (error) return toActionError(error);
    return { ok: true, data: (data ?? []) as unknown as ClaimEvidenceFile[] };
  });
}

/** Removes a draft evidence file; the object is deleted after the RPC verified ownership. */
export async function removeClaimEvidence(orgSlug: string, input: { fileId: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    const v = parse(claimEvidenceFileSchema, input);
    const { data: path, error } = await ctx.db.rpc("remove_claim_evidence", { p_file: v.fileId, p_acting_org: ctx.organizationId });
    if (error || !path) return toActionError(error);
    await createAdminClient().storage.from("claim-evidence").remove([path]);
    return { ok: true, message: msg("referrals.success.evidenceRemoved") };
  });
}

/** Files a prior-presentation claim (hiring side, single referral only). Declines with `prior_presentation`. */
export async function fileClaim(
  orgSlug: string,
  input: { referralId: string; version: number; evidenceKind: "file" | "referral"; fileIds?: string[]; evidenceReferralId?: string; priorProcessDate?: string; attested: boolean; note?: string },
): Promise<ActionResult<{ claimId: string; contestDeadlineAt: string; version: number }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    const v = parse(fileClaimSchema, input);
    // 10/h `referral.claim` is enforced inside file_prior_presentation_claim.
    const { data, error } = await ctx.db.rpc("file_prior_presentation_claim", fileClaimRpcArgs(v, ctx.organizationId));
    if (error || !data) return deadlineAwareError(error);
    const r = data as { claim_id: string; contest_deadline_at: string; version: number };
    revalidateReferral(orgSlug, v.referralId);
    // Same toast as the claim dialog (copy-review P5): "{partner} can contest it until {when} ET."
    const { data: ref } = await ctx.db.from("referrals").select("source_org:organizations!referrals_source_org_id_fkey(name)").eq("id", v.referralId).maybeSingle();
    const when = (await getFormatter()).etDateTime(r.contest_deadline_at);
    return {
      ok: true,
      data: { claimId: r.claim_id, contestDeadlineAt: r.contest_deadline_at, version: r.version },
      message: msg("referrals.claim.messages.filed", { partner: ref?.source_org?.name ?? "", when }),
    };
  });
}

/** Contests a claim (sourcing side, before the contest deadline). Opens a referral-level dispute. */
export async function contestClaim(orgSlug: string, input: { referralId: string; reason: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:submit");
    const v = parse(contestSchema, input);
    // 5/h `dispute.open` (shared with placement disputes, BR-19) is enforced inside the RPC.
    const { error } = await ctx.db.rpc("contest_prior_presentation_claim", { p_referral: v.referralId, p_reason: v.reason, p_acting_org: ctx.organizationId });
    if (error) return deadlineAwareError(error);
    revalidateReferral(orgSlug, v.referralId);
    return { ok: true, message: msg("referrals.contest.messages.contested") };
  });
}

/** 60-second signed URL for an evidence file: claiming org only, clean files only, audited. */
export async function getClaimEvidenceUrl(orgSlug: string, fileId: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    parse(id, fileId);
    await rateLimit(ctx.db, "document.url", 120, 600);
    const { data: path, error } = await ctx.db.rpc("authorize_claim_evidence", { p_file: fileId, p_acting_org: ctx.organizationId });
    if (error || !path) return toActionError(error ?? { message: "not_found" });
    const { data, error: sErr } = await createAdminClient().storage.from("claim-evidence").createSignedUrl(path, 60, { download: true });
    if (sErr || !data) return toActionError(sErr);
    return { ok: true, data: { url: data.signedUrl } };
  });
}
