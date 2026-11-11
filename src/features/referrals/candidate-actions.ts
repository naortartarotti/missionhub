"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { guard } from "@/server/actions/guard";
import { createClient } from "@/server/supabase/server";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/validation/form-data";
import { parseMajorToMinor } from "@/lib/money/format";
import { candidateDeclineSchema, candidateProfileSchema } from "./schemas";

/**
 * Public endpoints for the candidate's confirmation page. The candidate has no account: the
 * token from the emailed link is the only credential, checked (by hash) inside the database.
 */
const token = z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/);

async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
    user_agent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export async function confirmCandidateRequest(rawToken: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const t = token.safeParse(rawToken);
    if (!t.success) return toActionError({ message: "request_closed" });
    const parsed = candidateProfileSchema.safeParse(formToObject(formData, ["workArrangements"]));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;
    const currency = v.salaryCurrency || "CAD";
    const toMinor = (s: string) => (s ? parseMajorToMinor(s, currency) : null);
    const profile = {
      full_name: v.fullName,
      phone: v.phone,
      headline: v.headline,
      summary: v.summary,
      location_city: v.locationCity,
      location_region: v.locationRegion,
      location_country: v.locationCountry,
      // The database derives the relocation flag the matcher reads from this scope.
      relocation_scope: v.relocationScope,
      relocation_destinations: v.relocationScope && v.relocationScope !== "none" ? v.relocationDestinations : [],
      travel_availability: v.travelAvailability,
      work_authorization: v.workAuthorization,
      has_passport: v.hasPassport,
      work_arrangements: v.workArrangements,
      skills: v.skills,
      languages: v.languages,
      salary_expectation_min: toMinor(v.salaryMin),
      salary_expectation_max: toMinor(v.salaryMax),
      salary_currency: v.salaryCurrency || null,
      available_from: v.availableFrom,
    };
    const db = await createClient();
    const { error } = await db.rpc("respond_candidate_request", { p_token: t.data, p_accept: true, p_profile: profile, p_meta: await requestMeta() });
    if (error) return toActionError(error);
    redirect(`/candidate/${t.data}`);
  });
}

export async function declineCandidateRequest(rawToken: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const t = token.safeParse(rawToken);
    if (!t.success) return toActionError({ message: "request_closed" });
    const parsed = candidateDeclineSchema.safeParse(formToObject(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const db = await createClient();
    const { error } = await db.rpc("respond_candidate_request", { p_token: t.data, p_accept: false, p_reason: parsed.data.reason || undefined, p_meta: await requestMeta() });
    if (error) return toActionError(error);
    redirect(`/candidate/${t.data}`);
  });
}
