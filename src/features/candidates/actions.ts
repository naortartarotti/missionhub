"use server";

import { z } from "zod";

import { guard, id, parse, rateLimit, text } from "@/server/actions/guard";

import { randomUUID, createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { createAdminClient } from "@/server/supabase/admin";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/validation/form-data";
import { parseMajorToMinor } from "@/lib/money/format";
import { msg } from "@/i18n/translate";
import { ALLOWED_DOC_TYPES, MAX_DOC_BYTES, candidateFormSchema, consentSchema, statusSchema, type CandidateFormValues } from "./schemas";

function toRow(v: CandidateFormValues) {
  const toMinor = (n: number | null) => (n === null ? null : parseMajorToMinor(String(n), v.salaryCurrency));
  return {
    full_name: v.fullName,
    email: v.email,
    phone: v.phone,
    headline: v.headline,
    summary: v.summary,
    location_city: v.locationCity,
    location_region: v.locationRegion,
    location_country: v.locationCountry,
    open_to_relocation: v.openToRelocation,
    work_arrangements: v.workArrangements,
    seniority: v.seniority,
    years_experience: v.yearsExperience,
    skills: v.skills,
    languages: v.languages,
    tags: v.tags,
    salary_expectation_min: toMinor(v.salaryMin),
    salary_expectation_max: toMinor(v.salaryMax),
    salary_currency: v.salaryCurrency,
    available_from: v.availableFrom,
    notes: v.notes,
    source_detail: v.sourceDetail,
    legal_basis: v.legalBasis,
    privacy_notice_given_at: v.privacyNoticeGiven ? new Date().toISOString() : null,
  };
}

export async function createCandidate(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    const parsed = candidateFormSchema.safeParse(formToObject(formData, ["workArrangements"]));
    if (!parsed.success) return fromZodError(parsed.error);
    const { data, error } = await ctx.db
      .from("candidates")
      .insert({
        ...toRow(parsed.data),
        organization_id: ctx.organizationId,
        owner_id: ctx.userId,
        created_by: ctx.userId,
        source: parsed.data.source,
        status: "draft",
        last_reviewed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) return toActionError(error);
    revalidatePath(`/w/${orgSlug}/candidates`);
    redirect(`/w/${orgSlug}/candidates/${data.id}?created=1`);
  });
}

export async function updateCandidate(orgSlug: string, candidateId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    parse(id, candidateId);
    const parsed = candidateFormSchema.safeParse(formToObject(formData, ["workArrangements"]));
    if (!parsed.success) return fromZodError(parsed.error);
    const row = toRow(parsed.data);
    const { data, error } = await ctx.db
      .from("candidates")
      .update({ ...row, privacy_notice_given_at: row.privacy_notice_given_at ?? undefined, last_reviewed_at: new Date().toISOString() })
      .eq("id", candidateId)
      .eq("organization_id", ctx.organizationId)
      .select("id");
    if (error) return toActionError(error);
    if (!data?.length) return { ok: false, error: msg("candidates.errors.notFound") };
    revalidatePath(`/w/${orgSlug}/candidates/${candidateId}`);
    redirect(`/w/${orgSlug}/candidates/${candidateId}?updated=1`);
  });
}

export async function setCandidateStatus(orgSlug: string, input: { candidateId: string; status: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    if (parsed.data.status === "active_for_matching") {
      const { count } = await ctx.db
        .from("candidate_consents")
        .select("id", { count: "exact", head: true })
        .eq("candidate_id", parsed.data.candidateId)
        .eq("organization_id", ctx.organizationId)
        .eq("kind", "processing")
        .is("revoked_at", null);
      if (!count) {
        return { ok: false, error: msg("candidates.errors.permissionRequired") };
      }
    }
    const { data, error } = await ctx.db
      .from("candidates")
      .update({ status: parsed.data.status })
      .eq("id", parsed.data.candidateId)
      .eq("organization_id", ctx.organizationId)
      .select("id");
    if (error) return toActionError(error);
    if (!data?.length) return { ok: false, error: msg("candidates.errors.notFound") };
    revalidatePath(`/w/${orgSlug}/candidates/${parsed.data.candidateId}`);
    revalidatePath(`/w/${orgSlug}/candidates`);
    return {
      ok: true,
      message: parsed.data.status === "active_for_matching" ? msg("candidates.success.activated") : msg("candidates.success.statusUpdated"),
    };
  });
}

export async function recordConsent(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    const parsed = consentSchema.safeParse(formToObject(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    if (parsed.data.kind === "job_sharing" && !parsed.data.jobId) return { ok: false, error: msg("candidates.errors.selectJob") };
    const { error } = await ctx.db.from("candidate_consents").insert({
      organization_id: ctx.organizationId,
      candidate_id: parsed.data.candidateId,
      kind: parsed.data.kind,
      job_id: parsed.data.kind === "job_sharing" ? parsed.data.jobId : null,
      legal_basis: parsed.data.legalBasis,
      scope: parsed.data.scope,
      evidence: parsed.data.evidence,
      expires_at: parsed.data.expiresAt,
      recorded_by: ctx.userId,
    });
    if (error) return toActionError(error);
    revalidatePath(`/w/${orgSlug}/candidates/${parsed.data.candidateId}`);
    revalidatePath(`/w/${orgSlug}/opportunities`, "layout");
    return { ok: true, message: msg("candidates.success.consentRecorded") };
  });
}

export async function revokeConsent(orgSlug: string, input: { consentId: string; reason: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    const { consentId, reason } = parse(z.object({ consentId: id, reason: text(3, 500, msg("candidates.errors.revokeReason")) }), input);
    const { data, error } = await ctx.db
      .from("candidate_consents")
      .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
      .eq("id", consentId)
      .eq("organization_id", ctx.organizationId)
      .is("revoked_at", null)
      .select("candidate_id");
    if (error) return toActionError(error);
    if (!data?.length) return { ok: false, error: msg("candidates.errors.consentNotFound") };
    revalidatePath(`/w/${orgSlug}/candidates/${data[0].candidate_id}`);
    return { ok: true, message: msg("candidates.success.consentRevoked") };
  });
}

export async function uploadDocument(orgSlug: string, candidateId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    parse(id, candidateId);
    await rateLimit(ctx.db, "candidate.upload", 30, 3600);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: msg("candidates.errors.chooseFile") };
    const ext = ALLOWED_DOC_TYPES[file.type as keyof typeof ALLOWED_DOC_TYPES];
    if (!ext) return { ok: false, error: msg("candidates.errors.fileType") };
    if (file.size > MAX_DOC_BYTES) return { ok: false, error: msg("candidates.errors.fileSize") };

    // Confirm the candidate belongs to this tenant (RLS also enforces this).
    const { data: cand } = await ctx.db.from("candidates").select("id").eq("id", candidateId).eq("organization_id", ctx.organizationId).maybeSingle();
    if (!cand) return { ok: false, error: msg("candidates.errors.notFound") };

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const path = `${ctx.organizationId}/${candidateId}/${randomUUID()}.${ext}`;
    const { error: upErr } = await ctx.db.storage.from("candidate-documents").upload(path, bytes, { contentType: file.type, upsert: false });
    if (upErr) return toActionError(upErr);
    const safeName = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 160);
    const { error } = await ctx.db.from("candidate_documents").insert({
      organization_id: ctx.organizationId,
      candidate_id: candidateId,
      storage_path: path,
      file_name: safeName,
      mime_type: file.type,
      size_bytes: file.size,
      sha256,
      uploaded_by: ctx.userId,
    });
    if (error) return toActionError(error);
    revalidatePath(`/w/${orgSlug}/candidates/${candidateId}`);
    return { ok: true, message: msg("candidates.success.uploaded") };
  });
}

/** Issues a 60-second signed URL only after confirming tenant access through RLS. */
export async function getDocumentUrl(orgSlug: string, documentId: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:read");
    parse(id, documentId);
    await rateLimit(ctx.db, "document.url", 120, 600);
    const { data: doc } = await ctx.db
      .from("candidate_documents")
      .select("id, storage_path, candidate_id, scan_status")
      .eq("id", documentId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!doc) return { ok: false, error: msg("candidates.errors.documentNotFound") };
    if (doc.scan_status === "rejected") return { ok: false, error: msg("candidates.errors.scanRejected") };
    const { error: auditErr } = await ctx.db.rpc("audit_document_access", { p_document: doc.id });
    if (auditErr) return toActionError(auditErr);
    const { data, error } = await ctx.db.storage.from("candidate-documents").createSignedUrl(doc.storage_path, 60, { download: true });
    if (error || !data) return toActionError(error);
    return { ok: true, data: { url: data.signedUrl } };
  });
}

export async function deleteDocument(orgSlug: string, documentId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    parse(id, documentId);
    const { data, error } = await ctx.db
      .from("candidate_documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", documentId)
      .eq("organization_id", ctx.organizationId)
      .select("candidate_id, storage_path");
    if (error) return toActionError(error);
    if (!data?.length) return { ok: false, error: msg("candidates.errors.documentNotFound") };
    // Physically remove the object (service role; tenant ownership verified above).
    await createAdminClient().storage.from("candidate-documents").remove([data[0].storage_path]);
    revalidatePath(`/w/${orgSlug}/candidates/${data[0].candidate_id}`);
    return { ok: true, message: msg("candidates.success.documentDeleted") };
  });
}

export async function anonymizeCandidate(orgSlug: string, input: { candidateId: string; reason: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:anonymize");
    const v = parse(z.object({ candidateId: id, reason: text(5, 500, msg("candidates.errors.anonymizeReason")) }), input);
    const { error } = await ctx.db.rpc("anonymize_candidate", { p_candidate: v.candidateId, p_reason: v.reason });
    if (error) return toActionError(error);
    revalidatePath(`/w/${orgSlug}/candidates`);
    redirect(`/w/${orgSlug}/candidates?anonymized=1`);
  });
}
