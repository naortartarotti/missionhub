import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { Database } from "@/server/db/database.types";

export type Client = SupabaseClient<Database>;
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function admin(): Client {
  return createClient<Database>(url(), process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

export function anon(): Client {
  return createClient<Database>(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
}

export type TestUser = { id: string; email: string; client: Client };

/** N10: the current published Network Rules version (the seed publishes 1.0). */
export async function currentRulesVersion(): Promise<string> {
  const v = sql(`select coalesce(app.rules_current_version()::text, '')`)[0];
  if (!v) throw new Error("No published Network Rules version: run `npm run db:reset` (supabase/seed.sql publishes one).");
  return v;
}

/**
 * N10 BR-7: records a personal acceptance of the current version for a user, as the seed does for
 * demo users. Every test user gets one unless `acceptRules: false` (gate tests).
 */
export async function acceptRulesFor(userId: string, versionId?: string) {
  const v = versionId ?? (await currentRulesVersion());
  sql(`insert into public.network_rules_member_acceptances (user_id, version_id, locale, sha256)
       select '${userId}', '${v}', 'en', t.sha256 from public.network_rules_version_texts t
        where t.version_id = '${v}' and t.locale = 'en' on conflict do nothing`);
}

export async function createUser(label: string, opts: { platformAdmin?: boolean; acceptRules?: boolean } = {}): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@test.missionhub.local`;
  const password = `Pw-${randomUUID()}`;
  const a = admin();
  const { data, error } = await a.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: label } });
  if (error) throw error;
  if (opts.platformAdmin) {
    const { error: e } = await a.from("profiles").update({ is_platform_admin: true }).eq("id", data.user.id);
    if (e) throw e;
  }
  if (opts.acceptRules !== false) await acceptRulesFor(data.user.id);
  const client = anon();
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return { id: data.user.id, email, client };
}

/** Creates an org through the RPC, accepting the current rules for the org and personally (BR-6). */
export async function createOrg(user: TestUser, name: string) {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 6)}`;
  const { data, error } = await user.client.rpc("create_organization", {
    p_name: name, p_slug: slug, p_rules_version: await currentRulesVersion(), p_rules_locale: "en",
    p_accept_org: true, p_accept_member: true,
  });
  if (error) throw error;
  return { id: data as string, slug };
}

export async function createCandidate(user: TestUser, orgId: string, over: Partial<Database["public"]["Tables"]["candidates"]["Insert"]> = {}) {
  const { data, error } = await user.client
    .from("candidates")
    .insert({
      organization_id: orgId,
      owner_id: user.id,
      created_by: user.id,
      full_name: "Avery Test",
      // Unique per candidate: N1 fingerprints would otherwise make unrelated tests stop each other.
      email: `avery-${randomUUID().slice(0, 8)}@example.com`,
      headline: "Senior full-stack engineer",
      status: "active_for_matching",
      skills: ["typescript", "react", "postgresql", "aws"],
      seniority: "senior",
      years_experience: 7,
      work_arrangements: ["hybrid", "remote"],
      location_country: "CA",
      location_region: "ON",
      location_city: "Toronto",
      languages: ["english"],
      ...over,
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: cErr } = await user.client.from("candidate_consents").insert({
    organization_id: orgId,
    candidate_id: data.id,
    kind: "processing",
    scope: "Recruitment services",
    evidence: "Signed intake form 2026-11-01",
    recorded_by: user.id,
  });
  if (cErr) throw cErr;
  return data.id;
}

/** N2 default card used by fixtures: 20% of base, 6-month window (BR-1 default; equals the legacy 6-month look-back N1 tests assert). */
export const DEFAULT_TERMS = {
  p_fee_basis: "pct_base",
  p_rate_bps: 2000,
  p_search_type: "contingent_shared",
  p_attested: true,
  p_guarantee_days: 90,
  p_guarantee_remedy: "replacement_then_prorata",
  p_payment_terms_days: 30,
  p_ownership_months: 6,
} as const;
type TermsArgs = Omit<Database["public"]["Functions"]["save_job_terms"]["Args"], "p_job" | "p_open">;

/** Publishes a terms version through the RPC (the only path, BR-4) and opens the job unless `open` is false. */
export async function publishTerms(user: TestUser, jobId: string, terms: Partial<TermsArgs> = {}, open = true) {
  const { data, error } = await user.client
    .rpc("save_job_terms", { p_job: jobId, ...DEFAULT_TERMS, ...terms, p_open: open })
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** The job's current terms version id (what the submitter was shown). Any id when the job has none. */
export async function termsOf(jobId: string): Promise<string> {
  const { data, error } = await admin()
    .from("job_terms_versions").select("id").eq("job_id", jobId).eq("kind", "job")
    .order("version_no", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.id ?? randomUUID();
}

/**
 * Inserts a job and, unless `accepts_external_referrals: false` is passed, publishes the default card and
 * opens it to referrals through save_job_terms (N2: a job can't be inserted open).
 */
export async function createJob(user: TestUser, orgId: string, over: Partial<Database["public"]["Tables"]["jobs"]["Insert"]> = {}) {
  const { accepts_external_referrals: open = true, ...rest } = over;
  const { data, error } = await user.client
    .from("jobs")
    .insert({
      organization_id: orgId,
      owner_id: user.id,
      created_by: user.id,
      title: "Senior Software Engineer",
      client_name: `Northwind Health ${randomUUID().slice(0, 6)}`,
      client_confidential: true,
      description: "Build clinical scheduling tools.",
      status: "active",
      required_skills: ["typescript", "react", "postgresql"],
      preferred_skills: ["aws"],
      seniority: "senior",
      min_years_experience: 5,
      work_arrangement: "hybrid",
      location_country: "CA",
      location_region: "ON",
      languages: ["english"],
      expected_fee_minor: 2_000_000,
      ...rest,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (open) await publishTerms(user, data.id);
  return data.id;
}

export async function drainQueue() {
  // Skip the 2s debounce so tests are deterministic.
  await admin().from("background_jobs").update({ run_at: new Date(Date.now() - 1000).toISOString() }).in("status", ["queued", "failed"]);
  const { drain } = await import("@/server/queue/worker");
  return drain();
}

export async function sharingConsent(user: TestUser, orgId: string, candidateId: string, jobId: string) {
  const { data, error } = await user.client
    .from("candidate_consents")
    .insert({
      organization_id: orgId,
      candidate_id: candidateId,
      kind: "job_sharing",
      job_id: jobId,
      scope: "Share profile with partner recruiter for this role",
      evidence: "Email confirmation from candidate, 2026-11-05",
      recorded_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Direct SQL against the LOCAL database, for what PostgREST deliberately can't reach (the closed
 * `app` schema) and for moving clocks in tests. Uses `psql` (ships with the Supabase CLI setup).
 * Refuses anything but a local host.
 */
export function sql(query: string): string[] {
  const url = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`sql() refused: ${host} is not local`);
  const out = execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-At", "-c", query], { encoding: "utf8" });
  return out.split("\n").filter((l) => l !== "");
}

/**
 * N9: the real, server-issued candidate token, through the service-role path the Server Action uses
 * (issue_candidate_request_token). `actorId` must be an active member of the source org; the request
 * must have no live token (call rotate_candidate_request_token first to replace one).
 */
export async function issueCandidateToken(referralId: string, actorId: string): Promise<string> {
  const { data, error } = await admin().rpc("issue_candidate_request_token", { p_referral: referralId, p_actor: actorId });
  if (error) throw new Error(error.message);
  return data as string;
}


/**
 * The partner-side opportunity row for one candidate × job pair, read through get_opportunities(p_match),
 * or undefined when the caller can't see it (or no match exists). Use this instead of searching the full
 * list: PostgREST caps RPC results at max_rows (1000, supabase/config.toml), so on a long-lived local
 * stack a candidate's list is silently truncated and a specific job can fall off it.
 */
export async function opportunityFor(user: TestUser, orgId: string, candidateId: string, jobId: string) {
  const { data: m } = await admin().from("matches").select("id").eq("candidate_id", candidateId).eq("job_id", jobId).maybeSingle();
  if (!m) return undefined;
  const { data, error } = await user.client.rpc("get_opportunities", { p_org: orgId, p_match: m.id });
  if (error) throw new Error(error.message);
  return data?.[0];
}

/**
 * The database clock as an ISO timestamp, for `created_at >= since` bounds. Rows carry the DB's now();
 * the host clock can be a few ms off (QA-N2-06).
 */
export function dbNow(): string {
  return sql(`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)[0];
}

/** The referral's effective terms version (what the hire dialog shows); null for referrals sent before N2. */
export function effectiveTerms(referralId: string): string | undefined {
  const v = sql(`select coalesce(app.effective_terms_version('${referralId}')::text, '')`)[0];
  return v || undefined;
}
