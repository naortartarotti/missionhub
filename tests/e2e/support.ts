import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { Database } from "../../src/server/db/database.types";

type Client = SupabaseClient<Database>;
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const admin = (): Client => createClient<Database>(url(), process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

export type Account = { id: string; email: string; password: string; name: string; client: Client };

/** Creates a confirmed user with a known synthetic password (local test stack only). */
export async function createAccount(name: string, opts: { platformAdmin?: boolean } = {}): Promise<Account> {
  const email = `e2e-${name.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 8)}@test.missionhub.local`;
  const password = `E2e-${randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  if (opts.platformAdmin) {
    const { error: pErr } = await admin().from("profiles").update({ is_platform_admin: true }).eq("id", data.user.id);
    if (pErr) throw pErr;
  }
  const client = createClient<Database>(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return { id: data.user.id, email, password, name, client };
}

export async function createOrg(acct: Account, name: string) {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 6)}`;
  const { data, error } = await acct.client.rpc("create_organization", { p_name: name, p_slug: slug });
  if (error) throw error;
  return { id: data as string, slug, name };
}

export async function createCandidate(acct: Account, orgId: string, fullName: string) {
  const { data, error } = await acct.client
    .from("candidates")
    .insert({
      organization_id: orgId, owner_id: acct.id, created_by: acct.id, full_name: fullName,
      email: "e2e-candidate@example.com", phone: "+1 416 555 0199", headline: "Senior full-stack engineer",
      status: "active_for_matching", skills: ["typescript", "react", "postgresql", "aws"], seniority: "senior",
      years_experience: 8, work_arrangements: ["hybrid", "remote"], location_country: "CA", location_region: "ON",
      location_city: "Toronto", languages: ["english"],
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: cErr } = await acct.client.from("candidate_consents").insert({
    organization_id: orgId, candidate_id: data.id, kind: "processing", scope: "Recruitment services",
    evidence: "Synthetic E2E intake record", recorded_by: acct.id,
  });
  if (cErr) throw cErr;
  return data.id;
}

export async function createJob(acct: Account, orgId: string, title: string) {
  const { data, error } = await acct.client
    .from("jobs")
    .insert({
      organization_id: orgId, owner_id: acct.id, created_by: acct.id, title, client_name: "Northwind Health",
      client_confidential: true, description: "Build clinical scheduling tools.", status: "active",
      accepts_external_referrals: true, required_skills: ["typescript", "react", "postgresql"], preferred_skills: ["aws"],
      seniority: "senior", min_years_experience: 5, work_arrangement: "hybrid", location_country: "CA",
      location_region: "ON", languages: ["english"], expected_fee_minor: 2_000_000,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Matching runs in the background worker; skip the debounce and wait for the pair to be scored. */
export async function waitForMatch(candidateId: string, jobId: string) {
  const db = admin();
  await db.from("background_jobs").update({ run_at: new Date(Date.now() - 1000).toISOString() }).eq("status", "queued");
  await expect
    .poll(async () => (await db.from("matches").select("id").eq("candidate_id", candidateId).eq("job_id", jobId).maybeSingle()).data?.id, {
      timeout: 30_000,
      message: "match was not computed — is the worker running (npm run worker)?",
    })
    .toBeTruthy();
}

export async function signIn(page: Page, acct: Account, landing: RegExp = /\/w\/[^/]+\/overview/) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(acct.email);
  await page.getByLabel("Password").fill(acct.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(landing);
}
