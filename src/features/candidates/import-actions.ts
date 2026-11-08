"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { parseMajorToMinor } from "@/lib/money/format";
import { validateCsv, type CsvRowResult } from "./csv";

export type ImportPreview = { rows: Omit<CsvRowResult, "parsed">[]; valid: number; invalid: number; duplicates: number; checksum: string };

async function findDuplicates(ctx: Awaited<ReturnType<typeof getRequestContext>>, emails: string[]) {
  if (!emails.length) return new Set<string>();
  // Tenant-scoped only: duplicates are never checked against other organizations.
  const { data } = await ctx.db.from("candidates").select("email").eq("organization_id", ctx.organizationId).in("email", emails);
  return new Set((data ?? []).map((d) => String(d.email).toLowerCase()));
}

export async function previewImport(orgSlug: string, _: ActionResult<ImportPreview> | null, formData: FormData): Promise<ActionResult<ImportPreview>> {
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "candidates:write");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "CSV files must be 2 MB or smaller." };
  const text = await file.text();
  const result = validateCsv(text);
  if (result.fatal) return { ok: false, error: result.fatal };
  const dupes = await findDuplicates(ctx, result.rows.map((r) => r.parsed?.email).filter((e): e is string => Boolean(e)));
  const rows = result.rows.map(({ parsed, ...r }) => ({
    ...r,
    errors: parsed?.email && dupes.has(parsed.email) ? [...r.errors, "Possible duplicate: a candidate with this email already exists in your organization"] : r.errors,
  }));
  return {
    ok: true,
    data: {
      rows,
      valid: rows.filter((r) => r.errors.length === 0).length,
      invalid: rows.filter((r) => r.errors.length > 0).length,
      duplicates: rows.filter((r) => r.errors.some((e) => e.startsWith("Possible duplicate"))).length,
      checksum: createHash("sha256").update(text).digest("hex"),
    },
  };
}

/** Re-validates on the server (never trusts the preview) and inserts valid, non-duplicate rows as drafts. */
export async function commitImport(orgSlug: string, _: ActionResult<{ inserted: number }> | null, formData: FormData): Promise<ActionResult<{ inserted: number }>> {
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "candidates:write");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the CSV file again to confirm." };
  const text = await file.text();
  if (createHash("sha256").update(text).digest("hex") !== formData.get("checksum")) {
    return { ok: false, error: "The file changed since the preview. Preview it again." };
  }
  const result = validateCsv(text);
  if (result.fatal) return { ok: false, error: result.fatal };
  const valid = result.rows.filter((r) => r.parsed);
  const dupes = await findDuplicates(ctx, valid.map((r) => r.parsed!.email).filter((e): e is string => Boolean(e)));
  const rows = valid
    .filter((r) => !(r.parsed!.email && dupes.has(r.parsed!.email)))
    .map((r) => {
      const v = r.parsed!;
      return {
        organization_id: ctx.organizationId,
        owner_id: ctx.userId,
        created_by: ctx.userId,
        status: "draft" as const,
        full_name: v.fullName,
        email: v.email,
        phone: v.phone,
        headline: v.headline,
        skills: v.skills,
        languages: v.languages,
        seniority: v.seniority,
        years_experience: v.yearsExperience,
        location_city: v.locationCity,
        location_region: v.locationRegion,
        location_country: v.locationCountry,
        work_arrangements: v.workArrangements,
        salary_expectation_min: v.salaryMin === null ? null : parseMajorToMinor(String(v.salaryMin), v.salaryCurrency),
        salary_expectation_max: v.salaryMax === null ? null : parseMajorToMinor(String(v.salaryMax), v.salaryCurrency),
        salary_currency: v.salaryCurrency,
        source: "csv_import" as const,
        source_detail: v.sourceDetail ?? file.name.slice(0, 120),
      };
    });
  if (!rows.length) return { ok: false, error: "No valid, non-duplicate rows to import." };
  const { error } = await ctx.db.from("candidates").insert(rows);
  if (error) return toActionError(error);
  revalidatePath(`/w/${orgSlug}/candidates`);
  return { ok: true, data: { inserted: rows.length }, message: `${rows.length} candidates imported as drafts. Review each and record authorizations before activating.` };
}
