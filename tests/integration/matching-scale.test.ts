import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { recomputeForJob } from "@/features/matching/infrastructure/matching-service";
import { admin, createJob, createOrg, createUser, publishTerms, sql, type TestUser } from "./helpers";

/**
 * QA-PRE-01: job-side matching with hundreds of reachable candidates. The consent lookup used one
 * PostgREST `in.(…)` with up to 500 UUIDs and failed with "URI too long"; it is now chunked.
 */
const N = 620; // more than one 500-row candidate page and many 100-id consent chunks

let a: TestUser, b: TestUser;
let orgA: { id: string }, orgB: { id: string };
const skill = `scale-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  [a, b] = await Promise.all([createUser("scale-a"), createUser("scale-b")]);
  orgA = await createOrg(a, "Scale Agency A");
  orgB = await createOrg(b, "Scale Hiring B");
  const rows = Array.from({ length: N }, (_, i) => ({
    organization_id: orgA.id, owner_id: a.id, created_by: a.id, full_name: `Scale ${i}`, email: `scale-${i}-${randomUUID().slice(0, 6)}@example.com`,
    headline: "Engineer", status: "active_for_matching" as const, skills: [skill, "typescript"], seniority: "senior" as const, years_experience: 7,
    work_arrangements: ["hybrid" as const, "remote" as const], location_country: "CA", location_region: "ON", location_city: "Toronto", languages: ["english"],
  }));
  const ids: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await admin().from("candidates").insert(rows.slice(i, i + 200)).select("id");
    if (error) throw error;
    ids.push(...data.map((d) => d.id));
  }
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await admin().from("candidate_consents").insert(ids.slice(i, i + 200).map((candidate_id) => ({
      organization_id: orgA.id, candidate_id, kind: "processing" as const, scope: "Recruitment services", evidence: "Synthetic scale record", recorded_by: a.id,
    })));
    if (error) throw error;
  }
}, 120_000);

// The bulk insert queues one candidate re-match per row; drop them so later suites' drainQueue() stays fast.
afterAll(() => {
  sql(`delete from public.background_jobs where status in ('queued', 'failed') and payload::text like '%' || '${orgA.id}' || '%'
       or (status in ('queued', 'failed') and dedup_key in (select id::text from public.candidates where organization_id = '${orgA.id}'))`);
});

describe("job-side matching at scale (QA-PRE-01)", () => {
  it(`scores all ${N} reachable candidates and sees every candidate's permission`, async () => {
    const job = await createJob(b, orgB.id, { title: `Scale ${skill}`, required_skills: [skill], preferred_skills: [], accepts_external_referrals: false });
    await publishTerms(b, job); // opening the job is what triggers job matching
    const { written } = await recomputeForJob(admin(), job);
    expect(written).toBe(N);
    const { count } = await admin().from("matches").select("id", { count: "exact", head: true }).eq("job_id", job).is("expired_at", null);
    expect(count).toBe(N);
    // Every candidate's consent was found across the chunks: no "permission missing" blocker.
    expect(sql(`select count(*) from public.matches where job_id = '${job}' and blockers @> '[{"key": "permissionMissing"}]'`)).toEqual(["0"]);
  }, 120_000);
});
