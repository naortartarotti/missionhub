"use server";

import { guard, id, parse, rateLimit } from "@/server/actions/guard";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { createAdminClient } from "@/server/supabase/admin";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { msg } from "@/i18n/translate";
import { formToObject } from "@/lib/validation/form-data";
import { parseMajorToMinor } from "@/lib/money/format";
import { listOpportunities } from "@/features/matching/queries";
import { CANDIDATE_REQUEST_TTL_DAYS, emailCandidateRequest, newCandidateToken } from "./candidate-request";
import { bulkDeclineSchema, messageSchema, reportHireSchema, reviewSchema, submitReferralSchema, transitionSchema } from "./schemas";

export async function submitReferral(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "referrals:submit");
    await rateLimit(ctx.db, "referral.submit", 30, 3600);
    const parsed = submitReferralSchema.safeParse(formToObject(formData, ["fields", "documentIds"]));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;

    // Resolve candidate & job from the authorized projection, never from client-supplied ids.
    const [opp] = await listOpportunities(ctx, { matchId: v.matchId });
    if (!opp) return { ok: false, error: msg("referrals.errors.opportunityGone") };

    if (v.authMethod === "candidate_email") {
      // The referral waits in "awaiting_candidate", invisible to the partner, until the candidate
      // confirms through the private link emailed here. Confirming delivers it automatically.
      const { token, hash } = newCandidateToken();
      const { data, error } = await ctx.db
        .rpc("submit_referral_for_candidate", {
          p_candidate: opp.candidate_id,
          p_job: opp.job_id,
          p_fields: v.fields,
          p_document_ids: v.documentIds,
          p_idempotency_key: v.idempotencyKey,
          p_token_hash: hash,
          p_note: v.note || undefined,
          p_ttl_days: CANDIDATE_REQUEST_TTL_DAYS,
        })
        .single();
      if (error || !data) return toActionError(error);
      let flag = "awaiting";
      // A replayed submission (same idempotency key) already emailed its own link.
      if (data.created && data.destination) {
        const r = await emailCandidateRequest(ctx, { referralId: data.referral_id, token, to: data.destination, jobTitle: opp.job_title, partner: opp.job_org_name, candidateName: opp.candidate_name });
        if (!r.sent) flag = "notSent";
      }
      revalidatePath(`/workspace/${orgSlug}/opportunities`);
      revalidatePath(`/workspace/${orgSlug}/referrals`);
      redirect(`/workspace/${orgSlug}/referrals/${data.referral_id}?${flag}=1`);
    }

    let consentId = v.consentId && v.consentId !== "new" ? v.consentId : null;
    if (!consentId) {
      const { data, error } = await ctx.db
        .from("candidate_consents")
        .insert({
          organization_id: ctx.organizationId,
          candidate_id: opp.candidate_id,
          kind: "job_sharing",
          job_id: opp.job_id,
          legal_basis: v.newConsentBasis,
          scope: `Share the selected profile fields${v.documentIds.length ? " and documents" : ""} with ${opp.job_org_name} for "${opp.job_title}"`,
          evidence: v.newConsentEvidence!,
          recorded_by: ctx.userId,
        })
        .select("id")
        .single();
      if (error) return toActionError(error);
      consentId = data.id;
    }

    const { data: referralId, error } = await ctx.db.rpc("submit_referral", {
      p_candidate: opp.candidate_id,
      p_job: opp.job_id,
      p_fields: v.fields,
      p_document_ids: v.documentIds,
      p_consent: consentId,
      p_idempotency_key: v.idempotencyKey,
      p_note: v.note || undefined,
    });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/opportunities`);
    revalidatePath(`/workspace/${orgSlug}/referrals`);
    redirect(`/workspace/${orgSlug}/referrals/${referralId}?submitted=1`);
  });
}

export async function transitionReferral(orgSlug: string, input: { referralId: string; to: string; reason?: string; version: number }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
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
    revalidatePath(`/workspace/${orgSlug}/pipeline`);
    return { ok: true, message: msg("referrals.success.statusUpdated") };
  });
}

/** One queue decision (accept / decline with reason code / ask for info / mark in review). */
export async function reviewReferral(
  orgSlug: string,
  input: { referralId: string; to: string; reasonCode?: string; note?: string; version: number },
): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
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
    revalidatePath(`/workspace/${orgSlug}/pipeline`);
    return { ok: true, message: msg(`referrals.queue.done.${v.to}`) };
  });
}

/** Declines several pending referrals with one reason. Ones that changed meanwhile are skipped. */
export async function declineReferrals(orgSlug: string, input: { ids: string[]; reasonCode: string; note?: string }): Promise<ActionResult<{ count: number }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
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
    const ctx = await getRequestContext(orgSlug);
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
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "referrals:submit");
    parse(id, referralId);
    const { error } = await ctx.db.rpc("confirm_agreement", { p_referral: referralId });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/referrals/${referralId}`);
    return { ok: true, message: msg("referrals.success.agreementConfirmed") };
  });
}

export async function reportHire(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "referrals:review");
    const parsed = reportHireSchema.safeParse(formToObject(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const fee = parseMajorToMinor(parsed.data.fee, parsed.data.currency);
    if (!fee) return { ok: false, error: msg("errors.invalid_fee"), fieldErrors: { fee: [msg("referrals.validation.validAmount")] } };
    const { data: placementId, error } = await ctx.db.rpc("report_hire", {
      p_referral: parsed.data.referralId,
      p_fee_minor: fee,
      p_currency: parsed.data.currency,
      p_start_date: parsed.data.startDate,
      p_expected_version: parsed.data.version,
      p_guarantee_days: parsed.data.guaranteeDays,
    });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/referrals/${parsed.data.referralId}`);
    redirect(`/workspace/${orgSlug}/wallet/placements/${placementId}?created=1`);
  });
}

/** Authorizes through RLS-aware RPC (audited), then signs a 60-second URL from the referral bucket. */
export async function getReferralDocumentUrl(orgSlug: string, grantId: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
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
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "referrals:submit");
    parse(id, referralId);
    await rateLimit(ctx.db, "referral.candidate_resend", 10, 3600);
    const { data: ref } = await ctx.db
      .from("referrals")
      .select("job_title_snapshot, target_org:organizations!referrals_target_org_id_fkey(name)")
      .eq("id", referralId)
      .eq("source_org_id", ctx.organizationId)
      .maybeSingle();
    if (!ref) return { ok: false, error: msg("referrals.errors.notFound") };
    const { token, hash } = newCandidateToken();
    const { data: to, error } = await ctx.db.rpc("rotate_candidate_request_token", { p_referral: referralId, p_token_hash: hash, p_ttl_days: CANDIDATE_REQUEST_TTL_DAYS });
    if (error || !to) return toActionError(error);
    const r = await emailCandidateRequest(ctx, { referralId, token, to, jobTitle: ref.job_title_snapshot, partner: ref.target_org?.name ?? "" });
    revalidatePath(`/workspace/${orgSlug}/referrals/${referralId}`);
    if (!r.sent) return { ok: false, error: msg(r.reason === "not_configured" ? "referrals.errors.emailNotConfigured" : "referrals.errors.candidateEmailFailed") };
    return { ok: true, message: msg("referrals.success.candidateEmailResent", { email: to }) };
  });
}
