import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
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

export async function createUser(label: string, opts: { platformAdmin?: boolean } = {}): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@test.missionhub.local`;
  const password = `Pw-${randomUUID()}`;
  const a = admin();
  const { data, error } = await a.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: label } });
  if (error) throw error;
  if (opts.platformAdmin) {
    const { error: e } = await a.from("profiles").update({ is_platform_admin: true }).eq("id", data.user.id);
    if (e) throw e;
  }
  const client = anon();
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return { id: data.user.id, email, client };
}

export async function createOrg(user: TestUser, name: string) {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 6)}`;
  const { data, error } = await user.client.rpc("create_organization", { p_name: name, p_slug: slug });
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
      email: "avery@example.com",
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

export async function createJob(user: TestUser, orgId: string, over: Partial<Database["public"]["Tables"]["jobs"]["Insert"]> = {}) {
  const { data, error } = await user.client
    .from("jobs")
    .insert({
      organization_id: orgId,
      owner_id: user.id,
      created_by: user.id,
      title: "Senior Software Engineer",
      client_name: "Northwind Health",
      client_confidential: true,
      description: "Build clinical scheduling tools.",
      status: "active",
      accepts_external_referrals: true,
      required_skills: ["typescript", "react", "postgresql"],
      preferred_skills: ["aws"],
      seniority: "senior",
      min_years_experience: 5,
      work_arrangement: "hybrid",
      location_country: "CA",
      location_region: "ON",
      languages: ["english"],
      expected_fee_minor: 2_000_000,
      ...over,
    })
    .select("id")
    .single();
  if (error) throw error;
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
