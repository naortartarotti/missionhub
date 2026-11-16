"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { guard, id, parse, rateLimit } from "@/server/actions/guard";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { createAdminClient } from "@/server/supabase/admin";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { msg } from "@/i18n/translate";
import { formToObject } from "@/lib/validation/form-data";
import { getFormatter } from "@/i18n/server";
import {
  HIRE_EVIDENCE_KINDS,
  HIRE_EVIDENCE_MAX_BYTES,
  HIRE_EVIDENCE_MIME,
  authEvidenceSchema,
  contestHireReportSchema,
  fileHireReportSchema,
  itemsToRpc,
  rebutHireReportSchema,
  requestAuthCheckSchema,
  type HireEvidenceKind,
} from "./schemas";
import { z } from "zod";
import type { Json } from "@/server/db/database.types";

const BUCKET = "hire-evidence";
const kindSchema = z.enum(HIRE_EVIDENCE_KINDS);
export type HireEvidenceFile = { id: string; file_name: string; mime_type: string; size_bytes: number; uploaded_at: string; scan_status: string; sha256: string | null };

const referralPath = (orgSlug: string, referralId: string) => `/workspace/${orgSlug}/referrals/${referralId}`;
const partnerName = async (db: Awaited<ReturnType<typeof getRequestContext>>["db"], referralId: string, side: "source" | "target") => {
  const { data } = await db.from("referrals").select(side === "source" ? "org:organizations!referrals_target_org_id_fkey(name)" : "org:organizations!referrals_source_org_id_fkey(name)").eq("id", referralId).maybeSingle();
  return ((data as { org?: { name?: string } } | null)?.org?.name) ?? "";
};

// ---------------------------------------------------------------------------------------------
// Evidence files (the generalized N1 pipeline): upload → register → scan by the worker → ready.

/** Uploads one file for a purpose (`hire_report`, `hire_rebuttal`, `auth_evidence`: sourcing side; `hire_contest`, `auth_request`: hiring side). */
export async function uploadHireEvidence(orgSlug: string, referralId: string, ownerKind: HireEvidenceKind, _: ActionResult<HireEvidenceFile> | null, formData: FormData): Promise<ActionResult<HireEvidenceFile>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    parse(id, referralId);
    const kind = parse(kindSchema, ownerKind);
    await rateLimit(ctx.db, "hire.evidence_upload", 30, 3600);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: msg("errors.claim_file_invalid") };
    const ext = HIRE_EVIDENCE_MIME[file.type as keyof typeof HIRE_EVIDENCE_MIME];
    if (!ext || file.size > HIRE_EVIDENCE_MAX_BYTES) return { ok: false, error: msg("errors.claim_file_invalid") };
    const path = `${ctx.organizationId}/${referralId}/${randomUUID()}.${ext}`;
    const { error: upErr } = await ctx.db.storage.from(BUCKET).upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: msg("errors.not_found") };
    const { data, error } = await ctx.db.rpc("register_hire_evidence", {
      p_referral: referralId, p_owner_kind: kind, p_storage_path: path, p_file_name: file.name, p_acting_org: ctx.organizationId,
    });
    if (error || !data) {
      await createAdminClient().storage.from(BUCKET).remove([path]); // our own just-uploaded object
      return toActionError(error ?? { message: "not_found" });
    }
    return { ok: true, data: data as unknown as HireEvidenceFile };
  });
}

/** Draft files of one purpose with scan status and SHA-256, for polling. */
export async function getHireEvidenceFiles(orgSlug: string, referralId: string, ownerKind: HireEvidenceKind): Promise<ActionResult<HireEvidenceFile[]>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    parse(id, referralId);
    const kind = parse(kindSchema, ownerKind);
    const { data, error } = await ctx.db.rpc("list_hire_evidence_files", { p_referral: referralId, p_owner_kind: kind, p_acting_org: ctx.organizationId });
    if (error) return toActionError(error);
    return { ok: true, data: (data ?? []) as unknown as HireEvidenceFile[] };
  });
}

/** Removes a draft; the object is deleted after the RPC verified ownership. */
export async function removeHireEvidence(orgSlug: string, input: { fileId: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    const v = parse(z.object({ fileId: id }), input);
    const { data: path, error } = await ctx.db.rpc("remove_hire_evidence", { p_file: v.fileId, p_acting_org: ctx.organizationId });
    if (error || !path) return toActionError(error ?? { message: "not_found" });
    await createAdminClient().storage.from(BUCKET).remove([path as string]);
    return { ok: true };
  });
}

/** 60-second signed URL for one of the org's own files, after the audited authorization. */
export async function getHireEvidenceUrl(orgSlug: string, fileId: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    parse(id, fileId);
    await rateLimit(ctx.db, "document.url", 120, 600);
    const { data: path, error } = await ctx.db.rpc("authorize_hire_evidence", { p_file: fileId, p_acting_org: ctx.organizationId });
    if (error || !path) return toActionError(error ?? { message: "not_found" });
    const { data, error: sErr } = await createAdminClient().storage.from(BUCKET).createSignedUrl(path as string, 60, { download: true });
    if (sErr || !data) return toActionError(sErr);
    return { ok: true, data: { url: data.signedUrl } };
  });
}

// ---------------------------------------------------------------------------------------------
// Filing, contest, rebuttal

/** A files a hire report (BR-17 to BR-20). Outcomes are returned results; every eligibility refusal is the same code. */
export async function fileHireReport(orgSlug: string, _: ActionResult<{ reportId: string; answerDueAt: string }> | null, formData: FormData): Promise<ActionResult<{ reportId: string; answerDueAt: string }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:submit");
    const parsed = fileHireReportSchema.safeParse(formToObject(formData, ["fileIds"]));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;
    const { data, error } = await ctx.db.rpc("file_hire_report", {
      p_referral: v.referralId, p_acting_org: ctx.organizationId, p_employer: v.employer, p_start_month: `${v.startMonth}-01`,
      p_role: v.role ?? "", p_learned_via: v.learnedVia, p_statement: v.statement, p_tail_statement: v.tailStatement,  // empty role = not given
      p_items: itemsToRpc(v.items) as Json, p_file_ids: v.fileIds, p_attested: true,
    });
    if (error) return error.message?.startsWith("hire_report_invalid") ? { ok: false, error: msg("errors.invalidFields") } : toActionError(error);
    // v2.1 (QA-N3-02): refusals after the rate-limit hit come back as results ({error}), so the hit counts.
    const out = data as { report_id: string; answer_due_at: string; error?: string; placement_id?: string | null };
    if (out.error === "hire_report_tail_required") return { ok: false, error: msg("errors.invalidFields"), fieldErrors: { tailStatement: [msg("referrals.hireReport.validation.tail")] } };
    if (out.error === "hire_already_recorded") {
      return { ok: false, error: msg("errors.hire_already_recorded", { partner: await partnerName(ctx.db, v.referralId, "source") }),
               target: { placementId: out.placement_id ?? null, referralId: v.referralId } };
    }
    if (out.error) return toActionError({ message: out.error });
    const f = await getFormatter();
    revalidatePath(referralPath(orgSlug, v.referralId));
    return {
      ok: true,
      data: { reportId: out.report_id, answerDueAt: out.answer_due_at },
      message: msg("referrals.hireReport.messages.filed", { partner: await partnerName(ctx.db, v.referralId, "source"), when: f.etDateTime(out.answer_due_at) }),
    };
  });
}

/** B contests (BR-25): opens a `hire_report` dispute; A gets one rebuttal. */
export async function contestHireReport(orgSlug: string, referralId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    parse(id, referralId);
    const parsed = contestHireReportSchema.safeParse(formToObject(formData, ["fileIds"]));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;
    const { data, error } = await ctx.db.rpc("contest_hire_report", {
      p_report: v.reportId, p_acting_org: ctx.organizationId, p_reason: v.reason, p_statement: v.statement,
      // The dates are only for outside_window; PostgREST accepts null for these arguments (generated types say string).
      p_offer_accepted_on: v.offerAcceptedOn as string, p_process_started_on: v.processStartedOn as string, p_file_ids: v.fileIds, p_attested: true,
    });
    if (error) return error.message?.startsWith("hire_contest_invalid") ? { ok: false, error: msg("errors.invalidFields") } : toActionError(error);
    if ((data as { error?: string }).error) return toActionError({ message: (data as { error: string }).error });
    const f = await getFormatter();
    revalidatePath(referralPath(orgSlug, referralId));
    return { ok: true, message: msg("referrals.hireContest.messages.contested", { partner: await partnerName(ctx.db, referralId, "target"), when: f.etDateTime((data as { rebuttal_due_at: string }).rebuttal_due_at) }) };
  });
}

/** A's single rebuttal (BR-26). */
export async function rebutHireReport(orgSlug: string, referralId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:submit");
    parse(id, referralId);
    const parsed = rebutHireReportSchema.safeParse(formToObject(formData, ["fileIds"]));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;
    const { data, error } = await ctx.db.rpc("rebut_hire_report", {
      p_report: v.reportId, p_acting_org: ctx.organizationId, p_statement: v.statement, p_items: itemsToRpc(v.items) as Json, p_file_ids: v.fileIds, p_attested: true,
    });
    if (error) return error.message?.startsWith("hire_rebuttal_invalid") ? { ok: false, error: msg("errors.invalidFields") } : toActionError(error);
    if ((data as { error?: string } | null)?.error) return toActionError({ message: (data as { error: string }).error });
    revalidatePath(referralPath(orgSlug, referralId));
    return { ok: true, message: msg("referrals.hireRebuttal.messages.sent") };
  });
}

// ---------------------------------------------------------------------------------------------
// Authorization check (RD-029)

/** B asks for a check inside a contested objection or a contested / in-review hire report; once per dispute. */
export async function requestAuthorizationCheck(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:review");
    const parsed = requestAuthCheckSchema.safeParse(formToObject(formData, ["fileIds"]));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;
    const { data, error } = await ctx.db.rpc("request_authorization_check", { p_referral: v.referralId, p_acting_org: ctx.organizationId, p_reason: v.reason, p_file_ids: v.fileIds });
    if (error) return toActionError(error);
    if ((data as { error?: string } | null)?.error) return toActionError({ message: (data as { error: string }).error });
    revalidatePath(referralPath(orgSlug, v.referralId));
    return { ok: true, message: msg("referrals.authCheck.messages.requested") };
  });
}

/** A sends right-to-represent evidence before `evidence_due_at` (statement + 1–5 files). */
export async function submitAuthorizationEvidence(orgSlug: string, referralId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
    assertCan(ctx, "referrals:submit");
    parse(id, referralId);
    const parsed = authEvidenceSchema.safeParse(formToObject(formData, ["fileIds"]));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;
    const { error } = await ctx.db.rpc("submit_authorization_evidence", { p_check: v.checkId, p_acting_org: ctx.organizationId, p_statement: v.statement, p_file_ids: v.fileIds, p_attested: true });
    if (error) return toActionError(error);
    const f = await getFormatter();
    revalidatePath(referralPath(orgSlug, referralId));
    return { ok: true, message: msg("referrals.authCheck.sentLine", { date: f.etDate(new Date().toISOString()) }) };
  });
}
