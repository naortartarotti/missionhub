"use server";

import { z } from "zod";

import { guard, id, parse, rateLimit } from "@/server/actions/guard";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/validation/form-data";
import { parseMajorToMinor } from "@/lib/money/format";
import { msg } from "@/i18n/translate";
import { jobFormSchema, jobStatusSchema, type JobFormValues } from "./schemas";
import { extractJobFromText, type ExtractResult } from "./import/extract";
import { htmlToText, pageTitle, readJobPosting } from "./import/html";
import { fetchPage, ImportError, readFileText } from "./import/sources";
import { findSkills } from "./import/vocab";

function toRow(v: JobFormValues) {
  const m = (n: number | null, cur: string) => (n === null ? null : parseMajorToMinor(String(n), cur));
  return {
    title: v.title,
    client_name: v.clientName,
    client_confidential: v.clientConfidential,
    description: v.description,
    required_skills: v.requiredSkills,
    preferred_skills: v.preferredSkills,
    seniority: v.seniority,
    min_years_experience: v.minYearsExperience,
    work_arrangement: v.workArrangement,
    location_city: v.locationCity,
    location_region: v.locationRegion,
    location_country: v.locationCountry,
    languages: v.languages,
    contract_type: v.contractType,
    salary_min: m(v.salaryMin, v.salaryCurrency),
    salary_max: m(v.salaryMax, v.salaryCurrency),
    salary_currency: v.salaryCurrency,
    expected_fee_minor: m(v.expectedFee, v.feeCurrency),
    fee_currency: v.feeCurrency,
    accepts_external_referrals: v.acceptsExternalReferrals,
    share_description: v.shareDescription,
    share_salary: v.shareSalary,
    share_location: v.shareLocation,
    share_fee: v.shareFee,
  };
}

export async function createJob(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "jobs:write");
    await rateLimit(ctx.db, "job.create", 60, 3600);
    const parsed = jobFormSchema.safeParse(formToObject(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const { data, error } = await ctx.db
      .from("jobs")
      .insert({ ...toRow(parsed.data), status: parsed.data.status, organization_id: ctx.organizationId, owner_id: ctx.userId, created_by: ctx.userId })
      .select("id")
      .single();
    if (error) return toActionError(error);
    revalidatePath(`/w/${orgSlug}/jobs`);
    redirect(`/w/${orgSlug}/jobs/${data.id}?created=1`);
  });
}

export async function updateJob(orgSlug: string, jobId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "jobs:write");
    parse(id, jobId);
    const parsed = jobFormSchema.safeParse(formToObject(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const { data, error } = await ctx.db.from("jobs").update(toRow(parsed.data)).eq("id", jobId).eq("organization_id", ctx.organizationId).select("id");
    if (error) return toActionError(error);
    if (!data?.length) return { ok: false, error: msg("jobs.errors.notFound") };
    revalidatePath(`/w/${orgSlug}/jobs/${jobId}`);
    redirect(`/w/${orgSlug}/jobs/${jobId}?updated=1`);
  });
}

export async function setJobStatus(orgSlug: string, input: { jobId: string; status: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "jobs:write");
    const parsed = jobStatusSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    const { data, error } = await ctx.db
      .from("jobs")
      .update({ status: parsed.data.status })
      .eq("id", parsed.data.jobId)
      .eq("organization_id", ctx.organizationId)
      .select("id");
    if (error) return toActionError(error);
    if (!data?.length) return { ok: false, error: msg("jobs.errors.notFound") };
    // A filled / closed job releases every partner still waiting on a decision ("Position filled").
    let released = 0;
    if (["filled", "closed", "cancelled"].includes(parsed.data.status)) {
      const { data: n, error: dErr } = await ctx.db.rpc("decline_pending_for_job", { p_job: parsed.data.jobId });
      if (dErr) return toActionError(dErr);
      released = n ?? 0;
      if (released) revalidatePath(`/w/${orgSlug}/referrals`);
    }
    revalidatePath(`/w/${orgSlug}/jobs/${parsed.data.jobId}`);
    revalidatePath(`/w/${orgSlug}/jobs`);
    return {
      ok: true,
      message:
        parsed.data.status === "active"
          ? msg("jobs.messages.activated")
          : released
            ? msg("jobs.messages.statusUpdatedReleased", { count: released })
            : msg("jobs.messages.statusUpdated"),
    };
  });
}

/**
 * Rule-based requirement extraction from a pasted description (no AI key required).
 * Only suggests skills that literally appear in the text — never invents requirements.
 */
export async function suggestFromDescription(orgSlug: string, description: string): Promise<ActionResult<{ skills: string[]; seniority: string | null; years: number | null; arrangement: string | null }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "jobs:write");
    await rateLimit(ctx.db, "job.suggest", 60, 3600);
    const text = parse(z.string().max(50000, msg("jobs.validation.descriptionTooLong")), description).slice(0, 20000).toLowerCase();
    const skills = findSkills(text);
    const seniority = (["principal", "lead", "senior", "junior", "intern"] as const).find((s) => text.includes(s)) ?? (text.includes("intermediate") ? "mid" : null);
    const yrs = text.match(/(\d{1,2})\+?\s*(?:years|yrs)/);
    const arrangement = text.includes("remote") ? (text.includes("hybrid") ? "hybrid" : "remote") : text.includes("hybrid") ? "hybrid" : text.includes("on-site") || text.includes("onsite") ? "onsite" : null;
    return { ok: true, data: { skills, seniority, years: yrs ? Number(yrs[1]) : null, arrangement } };
  });
}

export type JobImportResult = ExtractResult & { source: "text" | "url" | "file"; structured: boolean };

/**
 * Pre-fills the new-job form from a pasted posting, a link or a file — rule-based, no AI.
 * Nothing is saved: the result only seeds the form, which the recruiter reviews before saving.
 * Pasted / fetched / uploaded content is untrusted data and is only ever parsed as text.
 */
export async function importJobPosting(orgSlug: string, formData: FormData): Promise<ActionResult<JobImportResult>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "jobs:write");
    const mode = parse(z.enum(["text", "url", "file"]), formData.get("mode"));
    await rateLimit(ctx.db, "job.import", 40, 3600);
    try {
      if (mode === "text") {
        const text = parse(z.string().max(50000, msg("jobs.validation.descriptionTooLong")), formData.get("text") ?? "");
        if (text.trim().length < 40) throw new ImportError("tooShort");
        return { ok: true, data: { ...extractJobFromText(text), source: mode, structured: false } };
      }
      if (mode === "url") {
        const raw = parse(z.string().trim().min(4, msg("jobs.import.errors.invalidUrl")).max(2000), formData.get("url") ?? "");
        const { html } = await fetchPage(raw);
        const posting = readJobPosting(html);
        if (posting) return { ok: true, data: { ...extractJobFromText(posting.descriptionText, posting.hints), source: mode, structured: true } };
        const text = htmlToText(html);
        const title = pageTitle(html);
        if (text.replace(/\s/g, "").length < 200) throw new ImportError("noText");
        return { ok: true, data: { ...extractJobFromText(text, title ? { title: title.split(/\s+[|–—-]\s+/)[0] } : {}), source: mode, structured: false } };
      }
      const file = formData.get("file");
      if (!(file instanceof File)) throw new ImportError("fileType");
      return { ok: true, data: { ...extractJobFromText(await readFileText(file)), source: mode, structured: false } };
    } catch (e) {
      if (e instanceof ImportError) return { ok: false, error: msg(`jobs.import.errors.${e.code}`) };
      throw e;
    }
  });
}
