import "server-only";
import type { AdminClient } from "@/server/supabase/admin";
import { evaluateMatch, inputFingerprint, toMatchCandidate, toMatchJob, type MatchCandidate, type SkillRelations } from "../domain/engine";
import { getSkillRelations, relatedOf, skillsImpliedBy } from "./skill-relations";
import { createHash } from "node:crypto";

/**
 * INTERNAL cross-organization matching. Runs only inside the background worker with the
 * service-role client. It never returns data to a user: it writes the `matches` table, which
 * users can only read through role-scoped SECURITY DEFINER projections (get_opportunities /
 * get_job_match_summary). Nothing here is logged with personal data.
 */
const CANDIDATE_FIELDS =
  "id, organization_id, status, skills, seniority, years_experience, work_arrangements, location_country, location_region, open_to_relocation, relocation_scope, relocation_destinations, work_authorization, travel_availability, languages, salary_expectation_min, salary_currency";
const JOB_FIELDS =
  "id, organization_id, status, accepts_external_referrals, required_skills, preferred_skills, seniority, min_years_experience, work_arrangement, location_country, location_region, languages, salary_max, salary_currency, travel_requirement, visa_sponsorship, relocation_support";

async function orgFlags(db: AdminClient, orgId: string) {
  const { data, error } = await db.from("organizations").select("is_demo, suspended_at").eq("id", orgId).single();
  if (error) throw error;
  return data;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);
const PAGE = 500;

async function hasProcessingAuthorization(db: AdminClient, candidateIds: string[]): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const { data, error } = await db
    .from("candidate_consents")
    .select("candidate_id, expires_at")
    .in("candidate_id", candidateIds)
    .eq("kind", "processing")
    .is("revoked_at", null);
  if (error) throw error;
  const now = Date.now();
  return new Set((data ?? []).filter((c) => !c.expires_at || Date.parse(c.expires_at) > now).map((c) => c.candidate_id));
}

type MatchRow = {
  candidate_id: string;
  job_id: string;
  candidate_org_id: string;
  job_org_id: string;
  score: number;
  band: "strong" | "potential" | "not_eligible";
  reasons: unknown;
  gaps: unknown;
  blockers: unknown;
  factor_scores: unknown;
  model_version: string;
  input_hash: string;
  refreshed_at: string;
  expired_at: null;
};

function buildRow(
  candidate: { id: string; organization_id: string },
  mc: MatchCandidate,
  job: Parameters<typeof toMatchJob>[0] & { id: string; organization_id: string },
  relations?: SkillRelations,
): MatchRow {
  const mj = toMatchJob(job);
  const r = evaluateMatch(mc, mj, relations);
  return {
    candidate_id: candidate.id,
    job_id: job.id,
    candidate_org_id: candidate.organization_id,
    job_org_id: job.organization_id,
    score: r.score,
    band: r.band,
    reasons: r.reasons,
    gaps: r.gaps,
    blockers: r.blockers,
    factor_scores: r.factorScores,
    model_version: r.modelVersion,
    input_hash: hash(inputFingerprint(mc, mj, relations)),
    refreshed_at: new Date().toISOString(),
    expired_at: null,
  };
}

async function upsert(db: AdminClient, rows: MatchRow[]) {
  for (let i = 0; i < rows.length; i += PAGE) {
    const { error } = await db
      .from("matches")
      .upsert(rows.slice(i, i + PAGE) as never, { onConflict: "candidate_id,job_id" });
    if (error) throw error;
  }
}

export async function recomputeForCandidate(db: AdminClient, candidateId: string) {
  const { data: candidate, error } = await db.from("candidates").select(CANDIDATE_FIELDS).eq("id", candidateId).maybeSingle();
  if (error) throw error;
  if (!candidate) return { written: 0 };
  if (candidate.status !== "active_for_matching") {
    await db.from("matches").update({ expired_at: new Date().toISOString() }).eq("candidate_id", candidateId).is("expired_at", null);
    return { written: 0 };
  }
  const flags = await orgFlags(db, candidate.organization_id);
  if (flags.suspended_at) return { written: 0 };
  const authorized = await hasProcessingAuthorization(db, [candidateId]);
  const mc = toMatchCandidate(candidate, authorized.has(candidateId));

  // Filter-then-rank: only jobs from OTHER orgs, open, sharing at least one skill (GIN overlap) —
  // exactly, or through a cached semantic relation ("next.js" also reaches jobs asking for "react").
  const reachable = mc.skills.length ? [...new Set([...mc.skills, ...(await skillsImpliedBy(db, mc.skills))])] : [];
  let written = 0;
  for (let from = 0; ; from += PAGE) {
    let q = db
      .from("jobs")
      .select(`${JOB_FIELDS}, organizations!inner(is_demo, suspended_at)`)
      .eq("organizations.is_demo", flags.is_demo)
      .is("organizations.suspended_at", null)
      .eq("status", "active")
      .eq("accepts_external_referrals", true)
      .neq("organization_id", candidate.organization_id)
      .order("id")
      .range(from, from + PAGE - 1);
    if (reachable.length) q = q.overlaps("required_skills", reachable);
    const { data: jobs, error: jErr } = await q;
    if (jErr) throw jErr;
    if (!jobs?.length) break;
    const relations = await getSkillRelations(db, jobs.flatMap((j) => [...(j.required_skills ?? []), ...(j.preferred_skills ?? [])]));
    const rows = jobs.map((j) => buildRow(candidate, mc, j, relations));
    await upsert(db, rows);
    written += rows.length;
    if (jobs.length < PAGE) break;
  }
  return { written };
}

export async function recomputeForJob(db: AdminClient, jobId: string) {
  const { data: job, error } = await db.from("jobs").select(JOB_FIELDS).eq("id", jobId).maybeSingle();
  if (error) throw error;
  if (!job) return { written: 0 };
  if (job.status !== "active" || !job.accepts_external_referrals) {
    await db.from("matches").update({ expired_at: new Date().toISOString() }).eq("job_id", jobId).is("expired_at", null);
    return { written: 0 };
  }
  const flags = await orgFlags(db, job.organization_id);
  if (flags.suspended_at) return { written: 0 };
  const mj = toMatchJob(job);
  const required = mj.requiredSkills;
  const relations = await getSkillRelations(db, [...required, ...mj.preferredSkills]);
  const reachable = [...new Set([...required, ...relatedOf(relations, required)])];
  let written = 0;
  for (let from = 0; ; from += PAGE) {
    let q = db
      .from("candidates")
      .select(`${CANDIDATE_FIELDS}, organizations!inner(is_demo, suspended_at)`)
      .eq("organizations.is_demo", flags.is_demo)
      .is("organizations.suspended_at", null)
      .eq("status", "active_for_matching")
      .neq("organization_id", job.organization_id)
      .order("id")
      .range(from, from + PAGE - 1);
    if (reachable.length) q = q.overlaps("skills", reachable);
    const { data: candidates, error: cErr } = await q;
    if (cErr) throw cErr;
    if (!candidates?.length) break;
    const authorized = await hasProcessingAuthorization(db, candidates.map((c) => c.id));
    const rows = candidates.map((c) => buildRow(c, toMatchCandidate(c, authorized.has(c.id)), job, relations));
    await upsert(db, rows);
    written += rows.length;
    if (candidates.length < PAGE) break;
  }
  return { written };
}
