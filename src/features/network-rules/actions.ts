"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertCan, getRequestContext, type RequestContext } from "@/server/auth/context";
import { AuthorizationError } from "@/server/auth/errors";
import { guard, id, parse, rateLimit } from "@/server/actions/guard";
import { createAdminClient } from "@/server/supabase/admin";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import {
  acceptRulesSchema,
  deactivateMemberSchema,
  fileReportSchema,
  followupReplySchema,
  reportReplySchema,
  reportTargetSchema,
  responseSchema,
  reviewRequestSchema,
} from "./schemas";
import { orNull } from "./rpc";
import type { ConductFile, ReportContext } from "./types";

/**
 * N10 member Server Actions. Each is a public POST endpoint: the org comes from the URL slug through
 * getRequestContext (never from input), every argument is parsed with Zod, and the database RPC
 * re-checks membership, side and role (it answers not_found otherwise). BR-34 actions opt in to
 * settlement mode; the acceptance action is on the BR-7 exempt list.
 */

const CONDUCT_BUCKET = "conduct-evidence";
const CONDUCT_TYPES = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" } as const;
const CONDUCT_MAX_BYTES = 10 * 1024 * 1024;
const SETTLE = { allowSettlement: true } as const;

const isOrgAdmin = (ctx: RequestContext) => ctx.membershipRole === "org_admin";

// ---------------------------------------------------------------------------
// Acceptance (BR-5 to BR-9, AC-21, AC-26, AC-144)
// ---------------------------------------------------------------------------

/** Accepts a version personally and/or for the org. Errors: rules_version_changed, rules_acceptance_required. */
export async function acceptNetworkRules(
  orgSlug: string,
  input: { versionId: string; locale: string; personal: boolean; forOrg: boolean },
): Promise<ActionResult<{ memberAccepted: boolean; orgAccepted: boolean }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true, rulesGateExempt: true });
    const v = parse(acceptRulesSchema, input);
    const { data, error } = await ctx.db.rpc("accept_network_rules", {
      p_org: ctx.organizationId,
      p_version: v.versionId,
      p_locale: v.locale,
      p_personal: v.personal,
      p_for_org: v.forOrg,
    });
    if (error) return toActionError(error);
    const r = data as { member_accepted: boolean; org_accepted: boolean };
    revalidatePath(`/workspace/${orgSlug}`, "layout");
    return { ok: true, data: { memberAccepted: r.member_accepted, orgAccepted: r.org_accepted } };
  });
}

// ---------------------------------------------------------------------------
// Conduct reports (BR-15 to BR-18, BR-25)
// ---------------------------------------------------------------------------

/** The report dialog's header (reported org as resolved by the server) and the categories for this side. */
export async function getConductReportContext(orgSlug: string, input: { referralId?: string; matchId?: string }): Promise<ActionResult<ReportContext>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, SETTLE);
    const v = parse(reportTargetSchema, input);
    const { data, error } = await ctx.db.rpc("get_conduct_report_context", { p_org: ctx.organizationId, p_referral: orNull(v.referralId), p_match: v.matchId });
    if (error) return toActionError(error);
    const r = data as { reported_org_name: string; side: ReportContext["side"]; categories: ReportContext["categories"] };
    return { ok: true, data: { reportedOrgName: r.reported_org_name, side: r.side, categories: r.categories } };
  });
}

/**
 * Uploads one evidence file for a report, a reply, a response or a review request (draft until the
 * filing call attaches it). The object goes to the private bucket with the user's client (storage
 * policy: own path, member of the org); the RPC records it from the stored object and queues the scan.
 */
export async function uploadConductEvidence(orgSlug: string, _: ActionResult<ConductFile> | null, formData: FormData): Promise<ActionResult<ConductFile>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, SETTLE);
    await rateLimit(ctx.db, "conduct.upload", 30, 3600);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return toActionError({ message: "conduct_file_invalid" });
    const ext = CONDUCT_TYPES[file.type as keyof typeof CONDUCT_TYPES];
    if (!ext || file.size > CONDUCT_MAX_BYTES) return toActionError({ message: "conduct_file_invalid" });
    const path = `${ctx.organizationId}/${ctx.userId}/${randomUUID()}.${ext}`;
    const { error: upErr } = await ctx.db.storage
      .from(CONDUCT_BUCKET)
      .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (upErr) return toActionError({ message: upErr.message.includes("rules_acceptance_required") ? "rules_acceptance_required" : "conduct_file_invalid" });
    const { data, error } = await ctx.db.rpc("register_conduct_evidence", { p_storage_path: path, p_file_name: file.name });
    if (error || !data) {
      await createAdminClient().storage.from(CONDUCT_BUCKET).remove([path]); // our own just-uploaded object
      return toActionError(error ?? { message: "conduct_file_invalid" });
    }
    return { ok: true, data: data as unknown as ConductFile };
  });
}

/** The caller's draft files (scan status polling). */
export async function getConductDraftFiles(orgSlug: string, fileIds?: string[]): Promise<ActionResult<ConductFile[]>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, SETTLE);
    const ids = fileIds ? fileIds.map((f) => parse(id, f)) : null;
    const { data, error } = await ctx.db.rpc("list_conduct_draft_files", { p_ids: orNull(ids) });
    if (error) return toActionError(error);
    return { ok: true, data: (data ?? []) as unknown as ConductFile[] };
  });
}

/** Removes a draft file; the object is deleted with the service role after the RPC verified ownership. */
export async function removeConductDraftFile(orgSlug: string, fileId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, SETTLE);
    parse(id, fileId);
    const { data: path, error } = await ctx.db.rpc("remove_conduct_draft_file", { p_file: fileId });
    if (error || !path) return toActionError(error ?? { message: "not_found" });
    await createAdminClient().storage.from(CONDUCT_BUCKET).remove([path]);
    return { ok: true };
  });
}

/** Files a conduct report. Errors: not_found, report_self, report_rate_limited_user/_org, conduct_files_not_ready. */
export async function fileConductReport(
  orgSlug: string,
  input: { referralId?: string; matchId?: string; category: string; description: string; occurredOn?: string | null; occurredApprox?: boolean; attested: boolean; fileIds?: string[] },
): Promise<ActionResult<{ caseId: string; firstResponseDueAt: string }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, SETTLE);
    const v = parse(fileReportSchema, input);
    const { data, error } = await ctx.db.rpc("file_conduct_report", {
      p_org: ctx.organizationId,
      p_referral: orNull(v.referralId),
      p_match: orNull(v.matchId),
      p_category: v.category,
      p_description: v.description,
      p_occurred_on: orNull(v.occurredOn),
      p_occurred_approx: v.occurredApprox,
      p_attested: v.attested,
      p_file_ids: v.fileIds,
    });
    if (error) return toActionError(error);
    const r = data as { case_id: string; first_response_due_at: string };
    if (v.referralId) revalidatePath(`/workspace/${orgSlug}/referrals/${v.referralId}`);
    revalidatePath(`/workspace/${orgSlug}/reports`);
    return { ok: true, data: { caseId: r.case_id, firstResponseDueAt: r.first_response_due_at } };
  });
}

/** The reporting user's one reply to an admin question. Error: conduct_reply_closed. */
export async function replyToConductInfoRequest(orgSlug: string, input: { caseId: string; body: string; fileIds?: string[] }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, SETTLE);
    const v = parse(reportReplySchema, input);
    const { error } = await ctx.db.rpc("reply_conduct_info_request", { p_org: ctx.organizationId, p_case: v.caseId, p_body: v.body, p_file_ids: v.fileIds });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/reports/${v.caseId}`);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Reported org (org_admin): response, follow-up replies, review request (BR-22, BR-31)
// ---------------------------------------------------------------------------
function requireOrgAdmin(ctx: RequestContext) {
  if (!isOrgAdmin(ctx)) throw new AuthorizationError();
}

/** One response per notice, before its deadline. Errors: conduct_response_exists, conduct_response_closed. */
export async function submitConductResponse(orgSlug: string, input: { noticeId: string; body: string; fileIds?: string[] }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, SETTLE);
    requireOrgAdmin(ctx);
    const v = parse(responseSchema, input);
    const { error } = await ctx.db.rpc("submit_conduct_response", { p_org: ctx.organizationId, p_notice: v.noticeId, p_body: v.body, p_file_ids: v.fileIds });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/settings/standing`, "layout");
    return { ok: true };
  });
}

/** One reply per follow-up question, before its deadline if it has one. */
export async function replyToConductFollowup(orgSlug: string, input: { followupId: string; body: string; fileIds?: string[] }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, SETTLE);
    requireOrgAdmin(ctx);
    const v = parse(followupReplySchema, input);
    const { error } = await ctx.db.rpc("reply_conduct_followup", { p_org: ctx.organizationId, p_followup: v.followupId, p_body: v.body, p_file_ids: v.fileIds });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/settings/standing`, "layout");
    return { ok: true };
  });
}

/** Requests the one review of a decision (BR-31). Errors: review_already_requested, review_window_closed. */
export async function requestSanctionReview(orgSlug: string, input: { caseId: string; text: string; fileIds?: string[] }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, SETTLE);
    requireOrgAdmin(ctx);
    const v = parse(reviewRequestSchema, input);
    const { error } = await ctx.db.rpc("request_sanction_review", { p_org: ctx.organizationId, p_case: v.caseId, p_text: v.text, p_file_ids: v.fileIds });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/settings/standing`, "layout");
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Settlement mode: team (BR-34.6)
// ---------------------------------------------------------------------------

/** Deactivates a member while the org is in settlement mode. Errors: last_admin, self_change, not_found. */
export async function deactivateMemberInSettlement(orgSlug: string, input: { membershipId: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, SETTLE);
    assertCan(ctx, "team:manage");
    const v = parse(deactivateMemberSchema, input);
    const { error } = await ctx.db.rpc("deactivate_member_in_settlement", { p_org: ctx.organizationId, p_membership: v.membershipId });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/settings/team`);
    return { ok: true };
  });
}
