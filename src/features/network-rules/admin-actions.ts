"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/server/auth/context";
import { AuthorizationError } from "@/server/auth/errors";
import { guard, id, parse, rateLimit } from "@/server/actions/guard";
import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import {
  conductCategorySchema,
  conductCloseSchema,
  conductDecisionSchema,
  conductFollowupSchema,
  conductInfoRequestSchema,
  conductNoticeSchema,
  conductOpenSchema,
  immediateHoldSchema,
  incidentNoticeSchema,
  liftSanctionSchema,
  reviewDecisionSchema,
  rulesDraftSchema,
  rulesPublishSchema,
  staleCloseSchema,
} from "./schemas";
import { orNull } from "./rpc";
import type { ConductFile } from "./types";

/**
 * N10 platform-admin Server Actions (/admin). The session gate here is UI-level; every RPC re-checks
 * app.is_platform_admin() in the database. Platform admins need no rules acceptance (BR-11).
 */

const CONDUCT_BUCKET = "conduct-evidence";
const CONDUCT_TYPES = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" } as const;

async function adminDb() {
  const user = await getSessionUser();
  if (!user?.isPlatformAdmin) throw new AuthorizationError();
  return { db: await createClient(), user };
}

const ADMIN_PATHS = () => {
  revalidatePath("/admin", "layout");
};

// ---------------------------------------------------------------------------
// Rules versions (BR-1 to BR-3). Publish errors: missing_locale, marker_found (detail = JSON
// [{locale,line,marker}]), effective_date (detail = earliest allowed date), upcoming_exists,
// label_taken, legal_reason_required, approval_reference_required, initial_exists, rule_numbers_mismatch.
// ---------------------------------------------------------------------------
export async function saveNetworkRulesDraft(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(rulesDraftSchema, input);
    const { data, error } = await db.rpc("save_network_rules_draft", {
      p_draft: orNull(v.draftId),
      p_label: v.label,
      p_type: v.type,
      p_effective_on: orNull(v.effectiveOn),
      p_texts: v.texts,
      p_summaries: v.summaries,
      p_legal_reason: orNull(v.legalReason),
      p_approval_reference: orNull(v.approvalReference),
    });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true, data: { id: data as string } };
  });
}

export async function deleteNetworkRulesDraft(draftId: string): Promise<ActionResult> {
  return guard(async () => {
    const { db } = await adminDb();
    parse(id, draftId);
    const { error } = await db.rpc("delete_network_rules_draft", { p_draft: draftId });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true };
  });
}

export async function publishNetworkRulesVersion(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(rulesPublishSchema, input);
    await rateLimit(db, "network_rules.publish", 20, 3600);
    const { data, error } = await db.rpc("publish_network_rules_version", {
      p_label: v.label,
      p_type: v.type,
      p_effective_on: orNull(v.effectiveOn),
      p_texts: v.texts,
      p_summaries: v.summaries,
      p_legal_reason: orNull(v.legalReason),
      p_approval_reference: v.approvalReference,
      p_draft: orNull(v.draftId),
    });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true, data: { id: data as string } };
  });
}

// ---------------------------------------------------------------------------
// Conduct queue: triage, notices, decisions (BR-20 to BR-24, BR-27, BR-28)
// ---------------------------------------------------------------------------
export async function setConductCategory(input: { caseId: string; category: string }): Promise<ActionResult> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(conductCategorySchema, input);
    const { error } = await db.rpc("admin_set_conduct_category", { p_case: v.caseId, p_category: v.category });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true };
  });
}

export async function requestConductInfo(input: { caseId: string; question: string; dueBusinessDays?: number | null }): Promise<ActionResult> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(conductInfoRequestSchema, input);
    const { error } = await db.rpc("admin_request_conduct_info", { p_case: v.caseId, p_question: v.question, p_due_business_days: orNull(v.dueBusinessDays) });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true };
  });
}

export async function closeConductCase(input: { caseId: string; reasonCode: string; reason: string }): Promise<ActionResult> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(conductCloseSchema, input);
    const { error } = await db.rpc("admin_close_conduct_case", { p_case: v.caseId, p_reason_code: v.reasonCode, p_reason: v.reason });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true };
  });
}

export async function openConductCase(input: unknown): Promise<ActionResult<{ caseId: string }>> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(conductOpenSchema, input);
    const { data, error } = await db.rpc("admin_open_conduct_case", {
      p_org: v.orgId,
      p_category: v.category,
      p_admin_source: v.adminSource,
      p_referral: orNull(v.referralId),
      p_description: v.description,
      p_file_ids: v.fileIds,
    });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true, data: { caseId: data as string } };
  });
}

export async function sendConductNotice(input: unknown): Promise<ActionResult<{ noticeId: string }>> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(conductNoticeSchema, input);
    const { data, error } = await db.rpc("admin_send_conduct_notice", {
      p_case: v.caseId,
      p_language: v.language,
      p_conduct_date: v.conductDate,
      p_rules_version: v.rulesVersionId,
      p_rules_cited: v.rulesCited,
      p_allegation: v.allegation,
      p_alleged_when: v.allegedWhen,
      p_evidence_summary: v.evidenceSummary,
      p_name_reporter: v.nameReporter,
    });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true, data: { noticeId: data as string } };
  });
}

/** Errors: immediate_hold_ground_invalid, org_already_restricted (nothing created), plus the notice field errors. */
export async function applyImmediateHold(input: unknown): Promise<ActionResult<{ noticeId: string; sanctionId: string; responseDueAt: string }>> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(immediateHoldSchema, input);
    const { data, error } = await db.rpc("admin_apply_immediate_hold", {
      p_case: v.caseId,
      p_ground: v.ground,
      p_language: v.language,
      p_conduct_date: v.conductDate,
      p_rules_version: v.rulesVersionId,
      p_rules_cited: v.rulesCited,
      p_allegation: v.allegation,
      p_alleged_when: v.allegedWhen,
      p_evidence_summary: v.evidenceSummary,
      p_name_reporter: v.nameReporter,
    });
    if (error) return toActionError(error);
    const r = data as { notice_id: string; sanction_id: string; response_due_at: string };
    ADMIN_PATHS();
    return { ok: true, data: { noticeId: r.notice_id, sanctionId: r.sanction_id, responseDueAt: r.response_due_at } };
  });
}

export async function sendConductFollowup(input: { noticeId: string; question: string; dueBusinessDays?: number | null }): Promise<ActionResult> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(conductFollowupSchema, input);
    const { error } = await db.rpc("admin_send_conduct_followup", { p_notice: v.noticeId, p_question: v.question, p_due_business_days: orNull(v.dueBusinessDays) });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true };
  });
}

/** Errors: sanction_notice_required, decision_rules_not_in_notice, sanction_reason_required, no_sanction_not_allowed. */
export async function decideConductCase(input: unknown): Promise<ActionResult<{ decisionId: string }>> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(conductDecisionSchema, input);
    const { data, error } = await db.rpc("admin_decide_conduct_case", {
      p_case: v.caseId,
      p_notice: v.noticeId,
      p_outcome: v.outcome,
      p_finding: orNull(v.finding),
      p_rules_cited: v.rulesCited,
      p_residual: v.residualTest,
      p_level: orNull(v.level),
      p_why_not_hold: orNull(v.whyNotHold),
      p_planned_review_on: orNull(v.plannedReviewOn),
    });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true, data: { decisionId: data as string } };
  });
}

/** Lifts a hold, a suspension, a termination (never by its decider: lift_not_allowed) or, with no sanctionId, a legacy suspension. */
export async function liftSanction(input: { orgId: string; sanctionId?: string | null; reason: string }): Promise<ActionResult> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(liftSanctionSchema, input);
    const { error } = await db.rpc("admin_lift_sanction", { p_org: v.orgId, p_sanction: orNull(v.sanctionId), p_reason: v.reason });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true };
  });
}

/** Errors: review_not_allowed (decider / hold applier), review_cannot_increase, already_reviewed. */
export async function decideSanctionReview(input: { reviewId: string; outcome: string; newLevel?: string | null; reason: string }): Promise<ActionResult> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(reviewDecisionSchema, input);
    const { error } = await db.rpc("admin_decide_sanction_review", { p_review: v.reviewId, p_outcome: v.outcome, p_new_level: orNull(v.newLevel), p_reason: v.reason });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true };
  });
}

/** 2.3 data-incident notice (RD-045). Errors: incident_not_allowed, incident_recipient_invalid. */
export async function sendIncidentNotice(input: unknown): Promise<ActionResult<{ noticeId: string }>> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(incidentNoticeSchema, input);
    const { data, error } = await db.rpc("admin_send_incident_notice", {
      p_case: v.caseId,
      p_recipient_orgs: v.recipientOrgIds,
      p_referrals: v.referralIds,
      p_information: v.information,
      p_when: v.when,
      p_to_whom: orNull(v.toWhom),
      p_language: v.language,
    });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true, data: { noticeId: data as string } };
  });
}

/** RD-047: terminated orgs only, 60 days without activity. Errors: not_terminated, not_stale. */
export async function closeStaleReferral(input: { referralId: string; reason: string }): Promise<ActionResult> {
  return guard(async () => {
    const { db } = await adminDb();
    const v = parse(staleCloseSchema, input);
    const { error } = await db.rpc("admin_close_stale_referral", { p_referral: orNull(v.referralId), p_reason: v.reason });
    if (error) return toActionError(error);
    ADMIN_PATHS();
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Conduct evidence, admin side (BR-43): 60-second signed URLs after the audited authorization.
// ---------------------------------------------------------------------------
export async function getAdminConductEvidenceUrl(fileId: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const { db } = await adminDb();
    parse(id, fileId);
    await rateLimit(db, "document.url", 120, 600);
    const { data: path, error } = await db.rpc("authorize_conduct_evidence", { p_file: fileId });
    if (error || !path) return toActionError(error ?? { message: "not_found" });
    const { data, error: sErr } = await createAdminClient().storage.from(CONDUCT_BUCKET).createSignedUrl(path, 60, { download: true });
    if (sErr || !data) return toActionError(sErr);
    return { ok: true, data: { url: data.signedUrl } };
  });
}

/** Evidence for an admin-initiated case (S18): uploaded under admin/{user}/, attached by openConductCase. */
export async function uploadAdminConductEvidence(_: ActionResult<ConductFile> | null, formData: FormData): Promise<ActionResult<ConductFile>> {
  return guard(async () => {
    const { db, user } = await adminDb();
    await rateLimit(db, "conduct.upload", 30, 3600);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return toActionError({ message: "conduct_file_invalid" });
    const ext = CONDUCT_TYPES[file.type as keyof typeof CONDUCT_TYPES];
    if (!ext || file.size > 10 * 1024 * 1024) return toActionError({ message: "conduct_file_invalid" });
    const path = `admin/${user.id}/${randomUUID()}.${ext}`;
    const { error: upErr } = await db.storage.from(CONDUCT_BUCKET).upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (upErr) return toActionError({ message: "conduct_file_invalid" });
    const { data, error } = await db.rpc("register_conduct_evidence", { p_storage_path: path, p_file_name: file.name });
    if (error || !data) {
      await createAdminClient().storage.from(CONDUCT_BUCKET).remove([path]);
      return toActionError(error ?? { message: "conduct_file_invalid" });
    }
    return { ok: true, data: data as unknown as ConductFile };
  });
}
