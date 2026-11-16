import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { Database } from "../../src/server/db/database.types";

type Client = SupabaseClient<Database>;
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const admin = (): Client => createClient<Database>(url(), process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

export type Account = { id: string; email: string; password: string; name: string; client: Client };

/** Creates a confirmed user with a known synthetic password (local test stack only). */
export async function createAccount(name: string, opts: { platformAdmin?: boolean; acceptRules?: boolean } = {}): Promise<Account> {
  const email = `e2e-${name.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 8)}@test.missionhub.local`;
  const password = `E2e-${randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  if (opts.platformAdmin) {
    const { error: pErr } = await admin().from("profiles").update({ is_platform_admin: true }).eq("id", data.user.id);
    if (pErr) throw pErr;
  }
  if (opts.acceptRules !== false) await acceptCurrentRules(data.user.id);
  const client = createClient<Database>(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return { id: data.user.id, email, password, name, client };
}

async function currentRulesVersionId() {
  const { data, error } = await admin().from("network_rules_versions").select("id").eq("status", "published")
    .lte("effective_at", new Date().toISOString()).order("effective_at", { ascending: false }).limit(1).single();
  if (error) throw error;
  return data.id;
}

/** N10 BR-7: a personal acceptance of the current version (service role, like the demo seed). */
export async function acceptCurrentRules(userId: string) {
  const versionId = await currentRulesVersionId();
  const { data: t, error } = await admin().from("network_rules_version_texts").select("sha256")
    .eq("version_id", versionId).eq("locale", "en").single();
  if (error) throw error;
  const { error: iErr } = await admin().from("network_rules_member_acceptances")
    .upsert({ user_id: userId, version_id: versionId, locale: "en", sha256: t.sha256 }, { onConflict: "user_id,version_id", ignoreDuplicates: true });
  if (iErr) throw iErr;
}

export async function createOrg(acct: Account, name: string) {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 6)}`;
  // N10 BR-6: the current Network Rules version is accepted for the org and personally.
  const { data, error } = await acct.client.rpc("create_organization", {
    p_name: name, p_slug: slug, p_rules_version: await currentRulesVersionId(), p_rules_locale: "en", p_accept_org: true, p_accept_member: true,
  });
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
      required_skills: ["typescript", "react", "postgresql"], preferred_skills: ["aws"],
      seniority: "senior", min_years_experience: 5, work_arrangement: "hybrid", location_country: "CA",
      location_region: "ON", languages: ["english"], expected_fee_minor: 2_000_000,
    })
    .select("id")
    .single();
  if (error) throw error;
  await openToReferrals(acct.client, data.id);
  return data.id;
}

/** N2: publishes a default terms card (20% of base, 6-month window) and opens the job, as the owner. */
export async function openToReferrals(client: Client, jobId: string) {
  const { error } = await client.rpc("save_job_terms", {
    p_job: jobId, p_fee_basis: "pct_base", p_rate_bps: 2000, p_search_type: "contingent_shared", p_attested: true,
    p_guarantee_days: 90, p_guarantee_remedy: "replacement_then_prorata", p_payment_terms_days: 30, p_ownership_months: 6, p_open: true,
  } as never);
  if (error) throw error;
}

/** N2: the job's current terms version id. */
export async function termsOf(jobId: string): Promise<string> {
  const { data, error } = await admin().from("job_terms_versions").select("id").eq("job_id", jobId).eq("kind", "job")
    .order("version_no", { ascending: false }).limit(1).single();
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

export async function signIn(page: Page, acct: Account, landing: RegExp = /\/workspace\/[^/]+\/overview/) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(acct.email);
  await page.getByLabel("Password").fill(acct.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(landing);
}
