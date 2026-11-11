"use server";

import { guard, rateLimit } from "@/server/actions/guard";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { parseMajorToMinor } from "@/lib/money/format";
import { msg } from "@/i18n/translate";
import { getGlobalT } from "@/i18n/server";
import { validateCsv, type CsvRowResult } from "./csv";

export type ImportPreview = { rows: Omit<CsvRowResult, "parsed">[]; valid: number; invalid: number; duplicates: number; checksum: string };

async function findDuplicates(ctx: Awaited<ReturnType<typeof getRequestContext>>, emails: string[]) {
  if (!emails.length) return new Set<string>();
  // Tenant-scoped only: duplicates are never checked against other organizations.
  const { data } = await ctx.db.from("candidates").select("email").eq("organization_id", ctx.organizationId).in("email", emails);
  return new Set((data ?? []).map((d) => String(d.email).toLowerCase()));
}

export async function previewImport(orgSlug: string, _: ActionResult<ImportPreview> | null, formData: FormData): Promise<ActionResult<ImportPreview>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    await rateLimit(ctx.db, "candidate.import_preview", 30, 3600);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: msg("candidates.errors.csvChoose") };
    if (file.size > 2 * 1024 * 1024) return { ok: false, error: msg("candidates.errors.csvSize") };
    const text = await file.text();
    const t = await getGlobalT();
    const result = validateCsv(text, undefined, t);
    if (result.fatal) return { ok: false, error: result.fatal };
    const dupes = await findDuplicates(ctx, result.rows.map((r) => r.parsed?.email).filter((e): e is string => Boolean(e)));
    // Row errors travel in `data`, which guard() doesn't localize, so they're translated here.
    let duplicates = 0;
    const rows = result.rows.map(({ parsed, ...r }) => {
      const duplicate = Boolean(parsed?.email && dupes.has(parsed.email));
      if (duplicate) duplicates++;
      return { ...r, errors: duplicate ? [...r.errors, t("candidates.errors.csvDuplicate")] : r.errors };
    });
    return {
      ok: true,
      data: {
        rows,
        valid: rows.filter((r) => r.errors.length === 0).length,
        invalid: rows.filter((r) => r.errors.length > 0).length,
        duplicates,
        checksum: createHash("sha256").update(text).digest("hex"),
      },
    };
  });
}

/** Re-validates on the server (never trusts the preview) and inserts valid, non-duplicate rows as drafts. */
export async function commitImport(orgSlug: string, _: ActionResult<{ inserted: number }> | null, formData: FormData): Promise<ActionResult<{ inserted: number }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    await rateLimit(ctx.db, "candidate.import", 10, 3600);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: msg("candidates.errors.csvChooseAgain") };
    const text = await file.text();
    if (createHash("sha256").update(text).digest("hex") !== formData.get("checksum")) {
      return { ok: false, error: msg("candidates.errors.csvChanged") };
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
    if (!rows.length) return { ok: false, error: msg("candidates.errors.csvNothing") };
    const { error } = await ctx.db.from("candidates").insert(rows);
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/candidates`);
    return { ok: true, data: { inserted: rows.length }, message: msg("candidates.success.imported", { count: rows.length }) };
  });
}
