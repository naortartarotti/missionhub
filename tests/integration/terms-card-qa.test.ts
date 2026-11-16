import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { allocatePlacement, allocateMinor } from "@/lib/money/allocate";
import { upsertJobs, type IngestScope } from "@/server/ingest/upsert";
import type { JobRecord } from "@/server/ingest/schema";
import { getReferralTerms } from "@/features/referrals/queries";
import type { RequestContext } from "@/server/auth/context";
import {
  admin, anon, createCandidate, createJob, createOrg, createUser, drainQueue, issueCandidateToken, opportunityFor, publishTerms, sharingConsent, sql,
  termsOf, effectiveTerms, type TestUser,
} from "./helpers";

/**
 * QA (step 6) for N2 job terms card: adversarial gaps not covered by terms-card.test.ts and
 * terms-hire-ledger.test.ts. Record scope (RD-036) is part of every notification check.
 *
 * Sourcing agency A: admin `a`, recruiter `aRec` (submits; owns the candidates), recruiter `aCol` (colleague).
 * Hiring agency B:   admin `b`, recruiter `bOwn` (owns the jobs), recruiter `bCol` (colleague), manager `bMgr`.
 * Other agency C:    `c`. Platform admin: `platform`.
 */

let a: TestUser, aRec: TestUser, aCol: TestUser, b: TestUser, bOwn: TestUser, bCol: TestUser, bMgr: TestUser, c: TestUser, platform: TestUser;
let orgA: { id: string }, orgB: { id: string }, orgC: { id: string };

const uniq = () => randomUUID().slice(0, 8);
const one = (q: string) => sql(q)[0];
const member = (orgId: string, u: TestUser, role: "recruiter" | "recruiter_manager") =>
  sql(`insert into public.organization_memberships (organization_id, user_id, role, status) values ('${orgId}', '${u.id}', '${role}', 'active')`);
const referral = async (id: string) => (await admin().from("referrals").select("*").eq("id", id).single()).data!;
const placement = async (id: string) => (await admin().from("placements").select("*").eq("id", id).single()).data!;
const allUsers = () => [a, aRec, aCol, b, bOwn, bCol, bMgr, c, platform];

type Outcome = { outcome: string; referral_id: string | null; reference: string | null };

const bJob = (over: Record<string, unknown> = {}) =>
  createJob(bOwn, orgB.id, { title: `QA ${uniq()}`, client_name: `QA Client ${uniq()}`, ...over });
const cand = (u: TestUser = aRec, orgId = orgA.id, over: Record<string, unknown> = {}) =>
  createCandidate(u, orgId, { email: `qa-${uniq()}@example.com`, ...over });

async function submit(jobId: string, termsVersion: string | null, opts: { u?: TestUser; orgId?: string; candidateId?: string; key?: string } = {}) {
  const u = opts.u ?? aRec;
  const orgId = opts.orgId ?? orgA.id;
  const candidateId = opts.candidateId ?? (await cand(u, orgId));
  const consent = await sharingConsent(u, orgId, candidateId, jobId);
  const res = await u.client
    .rpc("submit_referral", {
      p_candidate: candidateId, p_job: jobId, p_terms_version: termsVersion as string, p_fields: ["headline", "skills"], p_document_ids: [],
      p_consent: consent, p_idempotency_key: opts.key ?? randomUUID(),
    })
    .single();
  return { data: res.data as Outcome | null, error: res.error, candidateId };
}

async function submitForCandidate(jobId: string, termsVersion: string | null, u: TestUser = aRec, orgId = orgA.id, candidateId?: string) {
  const res = await u.client
    .rpc("submit_referral_for_candidate", {
      p_candidate: candidateId ?? (await cand(u, orgId)), p_job: jobId, p_terms_version: termsVersion as string, p_fields: ["headline", "skills"],
      p_document_ids: [], p_idempotency_key: randomUUID(),
    })
    .single();
  return { data: res.data as (Outcome & { created: boolean }) | null, error: res.error };
}

async function created(jobId: string, u: TestUser = aRec, orgId = orgA.id) {
  const r = await submit(jobId, await termsOf(jobId), { u, orgId });
  if (r.error || r.data?.outcome !== "created") throw new Error(r.error?.message ?? r.data?.outcome);
  return r.data.referral_id!;
}

async function step(u: TestUser, referralId: string, to: "accepted" | "interviewing" | "offer") {
  const { error } = await u.client.rpc("transition_referral", { p_referral: referralId, p_to: to, p_reason: "", p_expected_version: (await referral(referralId)).version });
  if (error) throw new Error(`${to}: ${error.message}`);
}
async function toOffer(referralId: string, source: TestUser = aRec) {
  await step(bOwn, referralId, "accepted");
  const conf = await source.client.rpc("confirm_agreement", { p_referral: referralId });
  if (conf.error) throw new Error(conf.error.message);
  await step(bOwn, referralId, "interviewing");
  await step(bOwn, referralId, "offer");
}

type HireArgs = Partial<{ p_base_minor: number; p_bonus_minor: number; p_invoiced_fee_minor: number; p_difference_reason: string; p_difference_note: string;
  p_legacy_fee_minor: number; p_legacy_currency: string; p_legacy_guarantee_days: number; p_start_date: string; p_expected_version: number }>;
const hire = async (referralId: string, args: HireArgs, u: TestUser = bOwn) =>
  u.client.rpc("report_hire", { p_referral: referralId, p_start_date: "2027-03-01", p_expected_version: (await referral(referralId)).version, p_terms_version: effectiveTerms(referralId), ...args });

const amendArgs = (referralId: string, over: Record<string, unknown> = {}) => ({
  p_referral: referralId, p_reason: "Client renegotiated the guarantee in writing.", p_hiring_request_reference: "email 2026-11-14 from B admin",
  p_sourcing_request_reference: "email 2026-11-14 from A admin", p_both_requested: true, p_fee_basis: "pct_base", p_rate_bps: 2000,
  p_search_type: "contingent_shared", p_guarantee_days: 60, p_guarantee_remedy: "replacement_then_prorata", p_payment_terms_days: 30, p_ownership_months: 6,
  ...over,
});
const amend = (u: TestUser, referralId: string, over: Record<string, unknown> = {}) =>
  u.client.rpc("admin_amend_referral_terms", amendArgs(referralId, over) as never);

/** The database clock (the Docker VM's clock can lag the host's by a few ms). */
const dbNow = () => sql(`select clock_timestamp()`)[0];
const notified = (since: string, kind: string, extra = "") =>
  sql(`select user_id from public.notifications where kind = '${kind}' and created_at >= '${since}' ${extra}`);

beforeAll(async () => {
  [a, aRec, aCol, b, bOwn, bCol, bMgr, c, platform] = await Promise.all([
    createUser("qa-a"), createUser("qa-arec"), createUser("qa-acol"), createUser("qa-b"), createUser("qa-bown"), createUser("qa-bcol"),
    createUser("qa-bmgr"), createUser("qa-c"), createUser("qa-admin", { platformAdmin: true }),
  ]);
  orgA = await createOrg(a, "QA Agency A");
  orgB = await createOrg(b, "QA Hiring B");
  orgC = await createOrg(c, "QA Other C");
  member(orgA.id, aRec, "recruiter");
  member(orgA.id, aCol, "recruiter");
  member(orgB.id, bOwn, "recruiter");
  member(orgB.id, bCol, "recruiter");
  member(orgB.id, bMgr, "recruiter_manager");
});

beforeEach(() => {
  sql(`delete from app.rate_limits where user_id in (${allUsers().map((u) => `'${u.id}'`).join(",")})`);
});

// ---------------------------------------------------------------------------------------------
describe("opening a job to partners without a card: every path (BR-4, BR-6, scenario 1, 13)", () => {
  it("user-client insert of an open job and a user upsert are refused; anon can't publish; colleagues and outsiders get not_found", async () => {
    const ins = await bOwn.client.from("jobs").insert({
      organization_id: orgB.id, owner_id: bOwn.id, created_by: bOwn.id, title: "Forged open", description: "x", status: "active", accepts_external_referrals: true,
    });
    expect(ins.error?.message).toMatch(/terms_incomplete/);
    const job = await bJob({ accepts_external_referrals: false });
    const up = await bOwn.client.from("jobs").upsert({ id: job, organization_id: orgB.id, owner_id: bOwn.id, created_by: bOwn.id, title: "Upsert open", description: "x", accepts_external_referrals: true });
    expect(up.error?.message).toMatch(/terms_incomplete|permission|policy/);
    expect(one(`select accepts_external_referrals from public.jobs where id = '${job}'`)).toBe("f");

    const anonCall = await anon().rpc("save_job_terms", { p_job: job, p_open: true, p_fee_basis: "pct_base", p_rate_bps: 2000 } as never);
    expect(anonCall.error).not.toBeNull();
    for (const u of [bCol, a, c, platform]) await expect(publishTerms(u, job)).rejects.toThrow(/not_found/);
    expect(one(`select count(*) from public.job_terms_versions where job_id = '${job}'`)).toBe("0");
  });

  it("save_job_terms is rate limited at 60/h (job.terms)", async () => {
    const job = await bJob();
    sql(`insert into app.rate_limits (user_id, bucket, window_start, hits)
         values ('${bOwn.id}', 'job.terms', to_timestamp(floor(extract(epoch from now()) / 3600) * 3600), 60)
         on conflict (user_id, bucket, window_start) do update set hits = 60`);
    await expect(publishTerms(bOwn, job)).rejects.toThrow(/rate_limited/);
  });

  it("the connector path (upsertJobs, service role) never opens a job; a connector currency change hides it with currency_mismatch (scenario 19, AC-75)", async () => {
    const scope: IngestScope = { organizationId: orgB.id, ownerId: bOwn.id, source: "api", origin: "api", sourceDetail: "QA API", defaultCurrency: "CAD", defaultJobStatus: "active" };
    const ext = `qa-${uniq()}`;
    const rec = (currency: string, extra: Record<string, unknown> = {}) => ({
      externalId: ext, title: `Connector role ${ext}`, clientName: `Connector client ${ext}`, description: "Imported role", requiredSkills: ["typescript", "react"],
      preferredSkills: [], seniority: "senior", minYearsExperience: 5, workArrangement: "hybrid", contractType: "permanent",
      location: { country: "CA" }, languages: ["english"], salary: { min: 100000, max: 120000, currency }, url: null, status: "active", ownerEmail: null, ...extra,
    }) as unknown as JobRecord;
    // A forged flag in the payload is ignored (it isn't part of the record), and the job stays private.
    const [r1] = await upsertJobs(admin() as never, scope, [{ ...rec("CAD"), accepts_external_referrals: true } as unknown as JobRecord]);
    expect(r1.action).toBe("created");
    const job = r1.id!;
    expect(one(`select accepts_external_referrals || ':' || status from public.jobs where id = '${job}'`)).toBe("false:active");
    await publishTerms(bOwn, job);
    await drainQueue();
    const refId = await created(job);
    expect(one(`select currency from public.job_terms_versions where id = '${await termsOf(job)}'`)).toBe("CAD");

    const [r2] = await upsertJobs(admin() as never, scope, [rec("USD")]);
    expect(r2.action).toBe("updated");
    const st = (await bOwn.client.rpc("get_jobs_terms_state", { p_org: orgB.id, p_job: job })).data![0];
    expect(st).toMatchObject({ partner_visible: false, hidden_reason: "currency_mismatch", currency: "CAD" });
    const cid = await cand();
    expect(await opportunityFor(aRec, orgA.id, cid, job)).toBeUndefined();
    expect((await submit(job, await termsOf(job), { candidateId: cid })).error?.message).toMatch(/job_not_open_for_referrals/);

    // Re-saving the card publishes a USD version (attestation needed: T4 changed) and the job is visible again.
    await expect(publishTerms(bOwn, job, { p_attested: false })).rejects.toThrow(/terms_attestation_required/);
    const v2 = await publishTerms(bOwn, job);
    expect(v2).toMatchObject({ created: true, version_no: 2 });
    expect(one(`select currency from public.job_terms_versions where id = '${v2.terms_version_id}'`)).toBe("USD");
    expect((await bOwn.client.rpc("get_jobs_terms_state", { p_org: orgB.id, p_job: job })).data![0].partner_visible).toBe(true);
    // The existing referral keeps its CAD terms.
    expect(one(`select v.currency from public.referrals r join public.job_terms_versions v on v.id = r.terms_version_id where r.id = '${refId}'`)).toBe("CAD");
  });

  it("draft, paused and closed open jobs with a card are hidden; reactivating makes them visible again (AC-16)", async () => {
    const job = await bJob();
    const cid = await cand();
    await drainQueue();
    const listed = async () => (await opportunityFor(aRec, orgA.id, cid, job)) !== undefined;
    expect(await listed()).toBe(true);
    for (const status of ["draft", "paused", "closed"] as const) {
      expect((await bOwn.client.from("jobs").update({ status }).eq("id", job)).error).toBeNull();
      expect(await listed()).toBe(false);
      expect((await submit(job, await termsOf(job), { candidateId: cid })).error?.message).toMatch(/job_not_open_for_referrals/);
    }
    expect((await bOwn.client.from("jobs").update({ status: "active" }).eq("id", job)).error).toBeNull();
    // Reactivated: partner-visible again (checked through the predicate users hit, independent of the match worker).
    expect((await bOwn.client.rpc("get_jobs_terms_state", { p_org: orgB.id, p_job: job })).data![0].partner_visible).toBe(true);
    expect((await submit(job, await termsOf(job), { candidateId: cid })).data?.outcome).toBe("created");
  });

  it("a hidden job answers exactly like a job that doesn't exist, on both submit RPCs; its match returns no composer row", async () => {
    const hidden = await bJob();
    const cid = await cand();
    await drainQueue();
    const { data: m } = await admin().from("matches").select("id").eq("candidate_id", cid).eq("job_id", hidden).single();
    await bOwn.client.from("jobs").update({ contract_type: "contract" }).eq("id", hidden);
    const terms = await termsOf(hidden);
    const ghost = randomUUID();
    const consent = await sharingConsent(aRec, orgA.id, cid, hidden);
    const rec = (jobId: string) => aRec.client.rpc("submit_referral", {
      p_candidate: cid, p_job: jobId, p_terms_version: terms, p_fields: ["headline"], p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID(),
    }).single();
    const h1 = await rec(hidden);
    const g1 = await rec(ghost);
    expect(h1.error?.message).toBe(g1.error?.message);
    expect(h1.error?.code).toBe(g1.error?.code);
    const h2 = await submitForCandidate(hidden, terms, aRec, orgA.id, cid);
    const g2 = await submitForCandidate(ghost, terms, aRec, orgA.id, cid);
    expect(h2.error?.message).toBe(g2.error?.message);
    expect(JSON.stringify(h1.error)).not.toMatch(/permanent|contract|terms|currency|suspend/i);
    const { data } = await aRec.client.rpc("get_opportunities", { p_org: orgA.id, p_match: m!.id });
    expect(data).toHaveLength(0);
  });

  it("admin metrics equal the BR-3 predicate on the live data set; non-admins are refused (AC-76)", async () => {
    const { data, error } = await platform.client.rpc("presentation_admin_metrics", { p_days: 30 });
    expect(error).toBeNull();
    const m = data as Record<string, number>;
    expect(m.partner_visible_jobs).toBe(Number(one(`select count(*) from public.jobs j where app.job_partner_visible(j)`)));
    expect(m.referral_open_without_terms).toBe(Number(one(`select count(*) from public.jobs j where j.status = 'active' and j.accepts_external_referrals
      and (app.current_job_terms(j.id)).id is null`)));
    for (const u of [a, b, c]) expect((await u.client.rpc("presentation_admin_metrics", { p_days: 30 })).error?.message).toMatch(/forbidden/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("terms_changed: forged, stale, foreign, null and amendment ids (BR-12, AC-24 to AC-26)", () => {
  it("candidate path: a stale version creates no referral, no request, no fingerprint, no hit; the same outcome for null, foreign, random and amendment ids", async () => {
    const job = await bJob();
    const v1 = await termsOf(job);
    // An amendment row of THIS job (kind 'amendment') must not pass as the current version.
    const refForAmend = await created(job);
    const { data: amendId, error: aErr } = await amend(platform, refForAmend);
    expect(aErr).toBeNull();
    await publishTerms(bOwn, job, { p_payment_terms_days: 60 });
    const foreign = await termsOf(await createJob(c, orgC.id, { title: `C ${uniq()}` }));
    const cid = await cand();
    const since = dbNow();
    const before = Number(one(`select count(*) from app.presentation_hits where source_org_id = '${orgA.id}'`));
    for (const id of [v1, null, foreign, randomUUID(), amendId as string]) {
      const r1 = await submitForCandidate(job, id, aRec, orgA.id, cid);
      expect(r1.error).toBeNull();
      expect(r1.data).toMatchObject({ outcome: "terms_changed", referral_id: null, created: false });
      const r2 = await submit(job, id, { candidateId: cid });
      expect(r2.error).toBeNull();
      expect(r2.data).toMatchObject({ outcome: "terms_changed", referral_id: null });
      // Identical shape, nothing from the other job.
      expect(Object.keys(r2.data!).sort()).toEqual(["outcome", "reference", "referral_id"]);
      expect(r2.data!.reference).toBeNull();
    }
    expect(one(`select count(*) from public.referral_candidate_links where candidate_id = '${cid}'`)).toBe("0");
    expect(one(`select count(*) from public.referral_candidate_requests where candidate_id = '${cid}'`)).toBe("0");
    expect(Number(one(`select count(*) from app.presentation_hits where source_org_id = '${orgA.id}'`))).toBe(before);
    // No notification of any kind was produced for B by these attempts.
    expect(one(`select count(*) from public.notifications where organization_id = '${orgB.id}' and created_at >= '${since}'`)).toBe("0");
  });

  it("every terms_changed counts toward the 30/h submit limit: the 31st attempt is rate limited", async () => {
    const job = await bJob();
    const cid = await cand();
    const consent = await sharingConsent(aRec, orgA.id, cid, job);
    const call = () => aRec.client.rpc("submit_referral", {
      p_candidate: cid, p_job: job, p_terms_version: randomUUID(), p_fields: ["headline"], p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID(),
    }).single();
    for (let i = 0; i < 30; i++) expect(((await call()).data as Outcome).outcome).toBe("terms_changed");
    const last = await call();
    expect(last.error?.message).toMatch(/rate_limited/);
    // Even the correct version is refused now (the limit is per user, before anything else).
    const ok = await aRec.client.rpc("submit_referral", {
      p_candidate: cid, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline"], p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID(),
    }).single();
    expect(ok.error?.message).toMatch(/rate_limited/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("snapshot immutability for every role, service role included (BR-4, BR-13)", () => {
  it("referral snapshot columns, agreement bps/rule and terms pointer can't be changed; a foreign version can't be inserted", async () => {
    const job = await bJob();
    const ref = await created(job);
    const otherJobVersion = await termsOf(await bJob());
    // A rule that is certainly not the referral's own (on a fresh DB the oldest rule IS the commit rule, and
    // an update to the same value is a no-op). Insert a retired, non-default one when none exists.
    const own = (await referral(ref)).commission_rule_id!;
    const rule2 = one(`select id from public.commission_rules where id <> '${own}' order by created_at limit 1`)
      ?? one(`insert into public.commission_rules (name, version, sourcing_bps, job_owner_bps, platform_bps, is_default, retired_at)
              values ('QA foreign rule ${uniq()}', 1, 4000, 5000, 1000, false, now()) returning id`);
    expect(rule2).not.toBe(own);
    expect((await admin().from("referrals").update({ terms_version_id: otherJobVersion } as never).eq("id", ref)).error?.message).toMatch(/immutable/);
    expect((await admin().from("referrals").update({ commission_rule_id: rule2 } as never).eq("id", ref)).error?.message).toMatch(/immutable|snapshot/);
    expect((await admin().from("referrals").update({ terms_version_id: null, commission_rule_id: null } as never).eq("id", ref)).error).not.toBeNull();
    // Hiring and sourcing sides have no write path at all.
    for (const u of [bOwn, b, aRec, a]) {
      const r = await u.client.from("referrals").update({ fee_estimate_minor: 1 } as never).eq("id", ref).select("id");
      expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
    }
    // Service-role insert under another job's version → tenant_mismatch.
    const ins = await admin().from("referrals").insert({
      job_id: job, source_org_id: orgA.id, source_user_id: aRec.id, target_org_id: orgB.id, idempotency_key: randomUUID(), job_title_snapshot: "x",
      candidate_label: "x", terms_version_id: otherJobVersion, commission_rule_id: rule2,
    } as never);
    expect(ins.error?.message).toMatch(/tenant_mismatch/);

    await step(bOwn, ref, "accepted");
    const ag = (await admin().from("collaboration_agreements").select("*").eq("referral_id", ref).single()).data!;
    expect((await admin().from("collaboration_agreements").update({ sourcing_bps: 9000, job_owner_bps: 0 } as never).eq("id", ag.id)).error?.message).toMatch(/immutable/);
    expect((await admin().from("collaboration_agreements").update({ platform_basis: "frozen" } as never).eq("id", ag.id)).error?.message).toMatch(/immutable/);
    // Repointing is allowed only to an amendment of the same referral: a job version (even of the same job) is refused.
    const v2 = (await publishTerms(bOwn, job, { p_rate_bps: 3000 })).terms_version_id;
    expect((await admin().from("collaboration_agreements").update({ terms_version_id: v2 } as never).eq("id", ag.id)).error?.message).toMatch(/immutable/);
    // Amendment notes are unreachable from any client.
    for (const u of [platform, bOwn, aRec]) {
      expect((await u.client.schema("app" as never).from("terms_amendment_notes" as never).select("*")).error).not.toBeNull();
    }
  });

  it("RLS on terms versions: the submitter reads its snapshot; a sourcing colleague, another org and A for a version it never committed under can't", async () => {
    const job = await bJob();
    const ref = await created(job);
    const snap = (await referral(ref)).terms_version_id!;
    const v2 = (await publishTerms(bOwn, job, { p_rate_bps: 2600 })).terms_version_id;
    const sees = async (u: TestUser, id: string) => ((await u.client.from("job_terms_versions").select("id").eq("id", id)).data ?? []).length;
    expect(await sees(aRec, snap)).toBe(1);
    expect(await sees(a, snap)).toBe(1); // org admin sees the agency's referrals
    expect(await sees(aCol, snap)).toBe(0); // RD-036 record scope
    expect(await sees(c, snap)).toBe(0);
    expect(await sees(aRec, v2)).toBe(0);
    for (const u of [bOwn, bCol, bMgr, platform]) expect(await sees(u, v2)).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("hire: forged inputs and bypasses (BR-21 to BR-26)", () => {
  it("rejects every forged combination on a snapshot referral; the guarantee is start + snapshot days (AC-43)", async () => {
    const job = await bJob({ accepts_external_referrals: false });
    await publishTerms(bOwn, job, { p_guarantee_days: 90 });
    const ref = await created(job);
    await toOffer(ref);
    // No bypass through the generic transition RPC.
    const t = await bOwn.client.rpc("transition_referral", { p_referral: ref, p_to: "hired", p_reason: "", p_expected_version: (await referral(ref)).version });
    expect(t.error).not.toBeNull();
    expect((await referral(ref)).status).toBe("offer");
    const err = async (args: HireArgs, u: TestUser = bOwn) => (await hire(ref, args, u)).error?.message;
    expect(await err({ p_legacy_fee_minor: 2_000_000 })).toMatch(/hire_terms_fixed/);
    expect(await err({ p_base_minor: 10_000_000, p_legacy_guarantee_days: 0 })).toMatch(/hire_terms_fixed/);
    expect(await err({ p_base_minor: 10_000_000, p_bonus_minor: 0 })).toMatch(/hire_base_invalid/); // % of base takes no bonus
    expect(await err({ p_base_minor: 0 })).toMatch(/hire_base_invalid/);
    expect(await err({ p_base_minor: -5 })).toMatch(/hire_base_invalid/);
    expect(await err({ p_base_minor: 10_000_000, p_invoiced_fee_minor: 0, p_difference_reason: "client_discount" })).toMatch(/invalid_fee/);
    expect(await err({ p_base_minor: 10_000_000, p_invoiced_fee_minor: -1, p_difference_reason: "client_discount" })).toMatch(/invalid_fee/);
    expect(await err({ p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_500_000, p_difference_reason: "other", p_difference_note: "   " })).toMatch(/fee_difference_reason_required/);
    expect(await err({ p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_500_000, p_difference_reason: "client_discount", p_difference_note: "x".repeat(501) })).toMatch(/fee_difference_note_too_long/);
    expect(await err({ p_base_minor: 10_000_000, p_difference_note: "a note without a difference" })).toMatch(/fee_difference_not_allowed/);
    expect(await err({ p_base_minor: 10_000_000, p_invoiced_fee_minor: 2_000_000, p_difference_reason: "client_discount" })).toMatch(/fee_difference_not_allowed/);
    expect(await err({ p_base_minor: 10_000_000, p_expected_version: 1 })).toMatch(/stale_version/);
    // N3 (spec §2.0): report_hire answers not_found to anyone who can't act (was forbidden).
    for (const u of [bCol, aRec, a, c, platform]) expect(await err({ p_base_minor: 10_000_000 }, u)).toMatch(/not_found/);
    expect((await referral(ref)).status).toBe("offer");

    const ok = await hire(ref, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_500_000, p_difference_reason: "client_discount", p_difference_note: "x".repeat(500) });
    expect(ok.error).toBeNull();
    const p = await placement(ok.data as string);
    expect(p).toMatchObject({ start_date: "2027-03-01", guarantee_until: "2027-05-30", currency: "CAD", computed_fee_minor: 2_000_000, contracted_fee_minor: 1_500_000 });
    // Facts immutable for the service role, including the reported base and reason.
    for (const patch of [{ reported_base_minor: 1 }, { fee_difference_reason: "other" }, { currency: "USD" }, { guarantee_until: "2030-01-01" }, { computed_fee_minor: 1_500_000 }]) {
      expect((await admin().from("placements").update(patch as never).eq("id", p.id)).error?.message).toMatch(/immutable/);
    }
  });

  it("the fee-difference notification follows record scope: the submitter only; when they leave, eligible managers, never a colleague (BR-24)", async () => {
    const job = await bJob();
    const ref1 = await created(job);
    await toOffer(ref1);
    let since = dbNow();
    await hire(ref1, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_700_000, p_difference_reason: "invoice_correction" });
    expect(notified(since, "placement.fee_difference")).toEqual([aRec.id]);
    expect(notified(since, "placement.fee_difference", `and organization_id = '${orgB.id}'`)).toEqual([]);

    const ref2 = await created(job);
    await toOffer(ref2);
    sql(`update public.organization_memberships set status = 'suspended' where organization_id = '${orgA.id}' and user_id = '${aRec.id}'`);
    try {
      since = dbNow();
      const r = await hire(ref2, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_700_000, p_difference_reason: "client_contract_rate" });
      expect(r.error).toBeNull();
      const got = notified(since, "placement.fee_difference");
      expect(got).toContain(a.id);
      expect(got).not.toContain(aCol.id);
      expect(got).not.toContain(aRec.id);
    } finally {
      sql(`update public.organization_memberships set status = 'active' where organization_id = '${orgA.id}' and user_id = '${aRec.id}'`);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("allocation at the boundaries, SQL ↔ TS (BR-27, BR-28, BR-30)", () => {
  type Case = { P: number; C: number | null; I: number; basis: "collected" | "frozen"; split?: [number, number, number]; expect?: [number, number, number] };
  const cases: Case[] = [
    // I = C: exactly today's allocate_minor.
    { P: 2_000_000, C: 2_000_000, I: 2_000_000, basis: "frozen", expect: [900_000, 900_000, 200_000] },
    // I just below C: floor path engages.
    { P: 1_999_999, C: 2_000_000, I: 1_999_999, basis: "collected", expect: [900_000, 900_000 - 1, 200_000] },
    // E-style: C 20,000, I 15,000, collected / frozen (AC-51, AC-55).
    { P: 1_500_000, C: 2_000_000, I: 1_500_000, basis: "collected", expect: [900_000, 450_000, 150_000] },
    { P: 1_500_000, C: 2_000_000, I: 1_500_000, basis: "frozen", expect: [900_000, 400_000, 200_000] },
    // Negative job owner (AC-52).
    { P: 800_000, C: 2_000_000, I: 800_000, basis: "collected", expect: [900_000, -180_000, 80_000] },
    // Partial payment P = I / 2 (AC-54).
    { P: 750_000, C: 2_000_000, I: 1_500_000, basis: "collected", expect: [450_000, 225_000, 75_000] },
    // Refund on the floor path: sign re-applied, sum = P.
    { P: -750_000, C: 2_000_000, I: 1_500_000, basis: "frozen", expect: [-450_000, -200_000, -100_000] },
    // Rounding: odd minor units.
    { P: 1, C: 3, I: 2, basis: "collected" },
    { P: 3, C: 7, I: 3, basis: "frozen" },
    { P: 333_333, C: 1_000_001, I: 999_999, basis: "collected" },
    // Legacy (C null) and I > C: allocate_minor.
    { P: 2_500_000, C: null, I: 2_500_000, basis: "collected", expect: [1_125_000, 1_125_000, 250_000] },
    { P: 2_500_000, C: 2_000_000, I: 2_500_000, basis: "frozen", expect: [1_125_000, 1_125_000, 250_000] },
    // Internal split (0 sourcing).
    { P: 1_500_000, C: 2_000_000, I: 1_500_000, basis: "frozen", split: [0, 9000, 1000], expect: [0, 1_300_000, 200_000] },
    // Large but realistic amounts (bigint range, beyond 2^53 for the intermediate product).
    // Largest legal amounts (P, I ≤ 10^12 since QA-N2-08 / QA-N2-07; was 9×10^12).
    { P: 900_000_000_000, C: 950_000_000_000, I: 900_000_000_000, basis: "frozen" },
  ];

  it("matches the worked examples, keeps sum = P, and SQL equals TS", () => {
    const vals = cases.map((x) => {
      const [s, jo, p] = x.split ?? [4500, 4500, 1000];
      return `(${x.P}::bigint, ${s}, ${jo}, ${p}, '${x.basis}'::public.platform_basis, ${x.C ?? "null"}::bigint, ${x.I}::bigint)`;
    }).join(",");
    const rows = sql(`select array_to_string(app.allocate_placement(a, s, jo, p, b, c, i), ',') from (values ${vals}) v(a, s, jo, p, b, c, i)`);
    cases.forEach((x, i) => {
      const [s, jo, p] = x.split ?? [4500, 4500, 1000];
      const sqlRow = rows[i].split(",").map(Number);
      const ts = allocatePlacement(x.P, { sourcingBps: s, jobOwnerBps: jo, platformBps: p }, { computedMinor: x.C, invoicedMinor: x.I, platformBasis: x.basis });
      expect([ts.sourcing, ts.jobOwner, ts.platform].map(Number), `case ${i}`).toEqual(sqlRow);
      expect(sqlRow[0] + sqlRow[1] + sqlRow[2], `sum case ${i}`).toBe(x.P);
      if (x.expect) expect(sqlRow, `expected case ${i}`).toEqual(x.expect);
      if (x.C === null || x.I >= x.C) expect(sqlRow).toEqual(allocateMinor(x.P, [s, jo, p]).map(Number));
    });
  });

  it("multiple partial payments add up to the projected split within 1 minor unit per payment, the job owner absorbing the drift", () => {
    const C = 2_000_003, I = 1_499_999;
    const payments = [500_000, 499_999, 500_000];
    const parts = payments.map((P) => sql(`select array_to_string(app.allocate_placement(${P}, 4500, 4500, 1000, 'collected', ${C}, ${I}), ',')`)[0].split(",").map(Number));
    const total = parts.reduce((acc, r) => acc.map((v, k) => v + r[k]), [0, 0, 0]);
    const whole = sql(`select array_to_string(app.allocate_placement(${I}, 4500, 4500, 1000, 'collected', ${C}, ${I}), ',')`)[0].split(",").map(Number);
    expect(total[0] + total[1] + total[2]).toBe(I);
    expect(Math.abs(total[0] - whole[0])).toBeLessThanOrEqual(payments.length);
    expect(Math.abs(total[2] - whole[2])).toBeLessThanOrEqual(payments.length);
  });

  it("an amount whose share exceeds bigint fails with invalid_fee in SQL rather than wrapping (QA-N2-02)", () => {
    expect(() => sql(`select app.allocate_placement(10000000000, 4500, 4500, 1000, 'collected', 10000000000, 1)`)).toThrow(/invalid_fee/); // QA-N2-02 fixed: a mapped code, not a raw overflow
  });
});

// ---------------------------------------------------------------------------------------------
describe("concierge amendment abuse and side effects (BR-34, BR-35, AC-58 to AC-62)", () => {
  it("undelivered referral: a T9 amendment applies at delivery; the hiring side (which can't see it yet) isn't notified; nothing but the terms pointer changes", async () => {
    const job = await bJob();
    const out = await submitForCandidate(job, await termsOf(job));
    expect(out.data?.outcome).toBe("created");
    const ref = out.data!.referral_id!;
    const since = dbNow();
    const { data: v1, error } = await amend(platform, ref, { p_ownership_months: 11, p_guarantee_days: 90 });
    expect(error).toBeNull();
    expect(notified(since, "referral.terms_amended", `and organization_id = '${orgB.id}'`)).toEqual([]);
    expect(notified(since, "referral.terms_amended", `and organization_id = '${orgA.id}'`)).toEqual(expect.arrayContaining([aRec.id, a.id]));
    expect(notified(since, "referral.terms_amended", `and organization_id = '${orgA.id}'`)).not.toContain(aCol.id);
    // A second amendment is numbered 2 and amends the first.
    const { data: v2 } = await amend(platform, ref, { p_ownership_months: 10, p_guarantee_days: 90 });
    expect(one(`select version_no || ':' || amends_version_id from public.job_terms_versions where id = '${v2}'`)).toBe(`2:${v1}`);
    const token = await issueCandidateToken(ref, aRec.id);
    expect((await anon().rpc("respond_candidate_request", { p_token: token, p_accept: true, p_profile: {} as never })).data).toBe("confirmed");
    expect(one(`select ownership_protected_until = app.add_months_et(delivered_at, 10) from public.referrals where id = '${ref}'`)).toBe("t");
    // Audit metadata carries the version id only; notification bodies carry no reason or reference.
    const audits = sql(`select metadata::text from public.audit_events where entity_id = '${ref}' and action = 'referral.terms_amended'`);
    expect(audits.length).toBeGreaterThanOrEqual(4);
    for (const m of audits) expect(Object.keys(JSON.parse(m))).toEqual(["version_id"]);
    expect(one(`select count(*) from public.notifications where link = '/referrals/${ref}' and (body ilike '%renegotiated%' or body ilike '%email 2026%')`)).toBe("0");
  });

  it("delivered referral: amending the guarantee moves no ownership date, claim deadline, split or rule; the hiring side is notified per record scope", async () => {
    const job = await bJob();
    const ref = await created(job);
    await step(bOwn, ref, "accepted");
    const before = await referral(ref);
    const agBefore = (await admin().from("collaboration_agreements").select("*").eq("referral_id", ref).single()).data!;
    const since = dbNow();
    const { data: vid, error } = await amend(platform, ref, { p_guarantee_days: 180, p_guarantee_remedy: "full_refund" });
    expect(error).toBeNull();
    const after = await referral(ref);
    expect([after.ownership_protected_until, after.claim_deadline_at, after.terms_version_id, after.commission_rule_id, after.fee_estimate_minor])
      .toEqual([before.ownership_protected_until, before.claim_deadline_at, before.terms_version_id, before.commission_rule_id, before.fee_estimate_minor]);
    const agAfter = (await admin().from("collaboration_agreements").select("*").eq("referral_id", ref).single()).data!;
    expect(agAfter).toMatchObject({ rule_id: agBefore.rule_id, sourcing_bps: agBefore.sourcing_bps, job_owner_bps: agBefore.job_owner_bps, platform_bps: agBefore.platform_bps, terms_version_id: vid });
    const hiring = notified(since, "referral.terms_amended", `and organization_id = '${orgB.id}'`);
    expect(hiring).toEqual(expect.arrayContaining([bOwn.id, bMgr.id, b.id]));
    expect(hiring).not.toContain(bCol.id);
    // Window change after delivery refused even together with another change.
    expect((await amend(platform, ref, { p_guarantee_days: 30, p_ownership_months: 12 })).error?.message).toMatch(/amendment_window_after_delivery/);
    // Unknown referral (admin) → not_found; non-admin → forbidden for existing and unknown ids alike (no oracle).
    expect((await amend(platform, randomUUID())).error?.message).toMatch(/not_found/);
    for (const u of [a, bOwn, b]) {
      const e1 = (await amend(u, ref)).error?.message;
      const e2 = (await amend(u, randomUUID())).error?.message;
      expect(e1).toMatch(/forbidden/);
      expect(e1).toBe(e2);
      expect((await u.client.rpc("admin_get_referral_terms", { p_referral: ref })).error?.message).toBe((await u.client.rpc("admin_get_referral_terms", { p_referral: randomUUID() })).error?.message);
    }
    // Neither org can read the reason or references through any table it can reach.
    for (const u of [aRec, a, bOwn, b]) {
      const { data } = await u.client.from("job_terms_versions").select("*").eq("id", vid as string);
      expect(JSON.stringify(data)).not.toMatch(/renegotiated|email 2026/);
    }
  });

  it("a hire after an amendment to flat takes no base; the placement uses the flat currency", async () => {
    const job = await bJob();
    const ref = await created(job);
    await toOffer(ref);
    const { data: vid, error } = await amend(platform, ref, { p_fee_basis: "flat", p_rate_bps: null, p_flat_fee_minor: 1_234_500, p_flat_currency: "USD" });
    expect(error).toBeNull();
    expect((await hire(ref, { p_base_minor: 10_000_000 })).error?.message).toMatch(/hire_base_invalid/);
    const ok = await hire(ref, {});
    expect(ok.error).toBeNull();
    expect(await placement(ok.data as string)).toMatchObject({ computed_fee_minor: 1_234_500, contracted_fee_minor: 1_234_500, currency: "USD", terms_version_id: vid, reported_base_minor: null });
  });
});

// ---------------------------------------------------------------------------------------------
describe("terms-change notifications follow record scope (BR-32, AC-30)", () => {
  it("three live referrals from one submitter → one notification, to the submitter only; no hiring-side or colleague notification; fallback to managers when the submitter left", async () => {
    const job = await bJob();
    await created(job);
    await created(job);
    await created(job);
    let since = dbNow();
    const res = await publishTerms(bOwn, job, { p_payment_terms_days: 45 });
    expect(res).toMatchObject({ created: true, notified_orgs: 1 });
    expect(notified(since, "job.terms_changed")).toEqual([aRec.id]);

    sql(`update public.organization_memberships set status = 'suspended' where organization_id = '${orgA.id}' and user_id = '${aRec.id}'`);
    try {
      since = dbNow();
      await publishTerms(bOwn, job, { p_payment_terms_days: 50 });
      const got = notified(since, "job.terms_changed");
      expect(got).toContain(a.id);
      expect(got).not.toContain(aCol.id);
      expect(got).not.toContain(aRec.id);
      expect(got.filter((u) => u === a.id)).toHaveLength(1);
    } finally {
      sql(`update public.organization_memberships set status = 'active' where organization_id = '${orgA.id}' and user_id = '${aRec.id}'`);
    }
    // A pure no-op save notifies nobody.
    since = dbNow();
    expect(await publishTerms(bOwn, job, { p_payment_terms_days: 50, p_attested: false })).toMatchObject({ created: false, notified_orgs: 0 });
    expect(notified(since, "job.terms_changed")).toEqual([]);
  });

  it("'Terms updated' shows for 30 days after version 2, then disappears; never for version 1 (BR-33, AC-21)", async () => {
    const job = await bJob();
    const cid = await cand();
    await drainQueue();
    const row = async () => (await opportunityFor(aRec, orgA.id, cid, job))!;
    expect((await row()).terms_updated_at).toBeNull();
    const v2 = (await publishTerms(bOwn, job, { p_rate_bps: 2100 })).terms_version_id;
    expect((await row()).terms_updated_at).not.toBeNull();
    const backdate = (days: number) =>
      sql(`set session_replication_role = replica; update public.job_terms_versions set created_at = now() - interval '${days} days' where id = '${v2}'`);
    backdate(29);
    expect((await row()).terms_updated_at).not.toBeNull();
    backdate(31);
    expect((await row()).terms_updated_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe("estimate leakage (BR-9, BR-11, AC-19, AC-27)", () => {
  it("% job with share_salary off: no estimate, share or band anywhere partners read; the minimum fee is still shown; the frozen estimate is null", async () => {
    const job = await bJob({ share_salary: false, salary_min: 12_000_000, salary_max: 14_000_000, accepts_external_referrals: false });
    await publishTerms(bOwn, job, { p_min_fee_minor: 1_500_000 });
    const cid = await cand();
    await drainQueue();
    const row = (await opportunityFor(aRec, orgA.id, cid, job))!;
    expect(row).toMatchObject({ estimated_fee_minor: null, estimated_share_minor: null, salary_min: null, salary_max: null, salary_currency: null, min_fee_minor: 1_500_000, rate_bps: 2000 });
    expect(JSON.stringify(row)).not.toMatch(/12000000|14000000|2600000/);
    const ref = await created(job);
    expect((await referral(ref)).fee_estimate_minor).toBeNull();
    // Turning share_salary on later never back-fills the frozen estimate.
    await bOwn.client.from("jobs").update({ share_salary: true }).eq("id", job);
    expect((await referral(ref)).fee_estimate_minor).toBeNull();
  });

  it("the candidate page payload carries no fee, rate, salary or terms (BR-14, AC-27)", async () => {
    const job = await bJob({ share_salary: true, salary_min: 10_000_000, salary_max: 12_000_000 });
    const out = await submitForCandidate(job, await termsOf(job));
    const token = await issueCandidateToken(out.data!.referral_id!, aRec.id);
    const { data, error } = await anon().rpc("get_candidate_request", { p_token: token });
    expect(error).toBeNull();
    // QA N3 round 1: the candidate's random fixture email (e.g. "qa-1feeea3d@") made /fee/ match by chance; drop it.
    const text = JSON.stringify(data, (k, v) => (k === "email" ? undefined : v));
    expect(text).not.toMatch(/fee|rate_bps|terms|guarantee|ownership|salary_min|salary_max|10000000|12000000|2200000/i);
  });
});

// ---------------------------------------------------------------------------------------------
describe("ownership dates in America/Toronto (BR-18, AC-35)", () => {
  it("uses the Toronto calendar date, not UTC, at the day boundary; clamps to Feb 29 in a leap year; DST doesn't shift the wall-clock time", () => {
    const etDate = (ts: string, n: number) => one(`select to_char(app.add_months_et('${ts}'::timestamptz, ${n}) at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI')`);
    // 2026-09-01 02:00 UTC is still Aug 31 in Toronto → Feb 28, not Mar 1.
    expect(etDate("2026-09-01T02:00:00Z", 6)).toBe("2027-02-28 22:00");
    expect(etDate("2027-08-31T15:00:00Z", 6)).toBe("2028-02-29 11:00");
    expect(etDate("2027-01-15T12:00:00Z", 12)).toBe("2028-01-15 07:00");
    // Across the March DST change: same local time.
    expect(etDate("2026-12-10T14:00:00Z", 6)).toBe("2027-06-10 09:00");
  });
});

// ---------------------------------------------------------------------------------------------
describe("agreements: internal and legacy referrals; client key and base salary exposure (AC-29, AC-32, AC-33, AC-71, AC-73)", () => {
  it("an internal snapshot referral gets 0 sourcing bps from its commit rule; partners see no share for internal jobs", async () => {
    // b administers orgB and a sister org: referrals between them are internal.
    const sister = await createOrg(b, "QA Sister of B");
    const job = await bJob({ share_salary: true, salary_min: 10_000_000, salary_max: 10_000_000 });
    const cid = await createCandidate(b, sister.id, { email: `qa-int-${uniq()}@example.com` });
    await drainQueue();
    const row = await opportunityFor(b, sister.id, cid, job);
    if (row) expect(row).toMatchObject({ internal: true, estimated_share_minor: null });
    const r = await submit(job, await termsOf(job), { u: b, orgId: sister.id, candidateId: cid });
    expect(r.data?.outcome).toBe("created");
    const ref = await referral(r.data!.referral_id!);
    expect(ref.internal).toBe(true);
    await step(bOwn, ref.id, "accepted");
    const ag = (await admin().from("collaboration_agreements").select("*").eq("referral_id", ref.id).single()).data!;
    expect(ag).toMatchObject({ rule_id: ref.commission_rule_id, sourcing_bps: 0, job_owner_bps: 9000, platform_bps: 1000, terms_version_id: ref.terms_version_id });
  });

  it("a legacy referral accepted after N2 gets today's agreement (current default rule, no terms reference) and keeps a 12-month window", async () => {
    const job = await bJob();
    const out = await submitForCandidate(job, await termsOf(job));
    const id = out.data!.referral_id!;
    sql(`set session_replication_role = replica;
         update public.referrals set terms_version_id = null, commission_rule_id = null, fee_estimate_minor = null where id = '${id}';
         delete from app.referral_commit_keys where referral_id = '${id}'`);
    const token = await issueCandidateToken(id, aRec.id);
    expect((await anon().rpc("respond_candidate_request", { p_token: token, p_accept: true, p_profile: {} as never })).data).toBe("confirmed");
    expect(one(`select ownership_protected_until = app.add_months_et(delivered_at, 12) from public.referrals where id = '${id}'`)).toBe("t");
    await step(bOwn, id, "accepted");
    const ag = (await admin().from("collaboration_agreements").select("*").eq("referral_id", id).single()).data!;
    const def = one(`select id from public.commission_rules where is_default and retired_at is null order by version desc limit 1`);
    expect(ag).toMatchObject({ rule_id: def, terms_version_id: null, platform_basis: "collected" });
    expect(ag.terms_version).toBeTruthy(); // network-rules text version, unchanged meaning (BR-17)
  });

  it("the commit client key is in no audit metadata, notification or partner payload; no public function reads the closed table", async () => {
    expect(one(`select count(*) from public.audit_events where metadata::text ilike '%client_key%'`)).toBe("0");
    const readers = sql(`select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.prosrc ilike '%referral_commit_keys%' order by 1`);
    // Only the two submit RPCs write it; no member-callable function returns it. N3 v2: the platform-admin hire-report
    // detail reads it deliberately (RD-033, spec section 2.9: admins see both keys); it must stay platform-admin gated.
    expect(readers).toEqual(["public.admin_get_hire_report", "public.submit_referral", "public.submit_referral_for_candidate"]);
    for (const fn of readers.filter((x) => x !== "public.admin_get_hire_report")) {
      expect(one(`select prosrc ilike '%from app.referral_commit_keys%' from pg_proc where proname = '${fn.split(".")[1]}'`)).toBe("f");
    }
    expect(one(`select prosrc ilike '%if not app.is_platform_admin() then raise exception%' from pg_proc where proname = 'admin_get_hire_report'`)).toBe("t");
    const job = await bJob();
    const ref = await created(job);
    const key = one(`select client_key from app.referral_commit_keys where referral_id = '${ref}'`);
    expect(key).toBeTruthy();
    const { data: asSource } = await aRec.client.from("referrals").select("*").eq("id", ref).single();
    const { data: asTarget } = await bOwn.client.from("referrals").select("*").eq("id", ref).single();
    expect(JSON.stringify([asSource, asTarget])).not.toContain(key);
  });

  it("base and bonus at hire are visible to both orgs' eligible members and platform admins only (AC-71)", async () => {
    const job = await bJob({ accepts_external_referrals: false });
    await publishTerms(bOwn, job, { p_fee_basis: "pct_total_cash", p_rate_bps: 1500 });
    const ref = await created(job);
    await toOffer(ref);
    const { data: pid, error } = await hire(ref, { p_base_minor: 9_000_000, p_bonus_minor: 1_000_000 });
    expect(error).toBeNull();
    const read = async (u: TestUser) => (await u.client.from("placements").select("reported_base_minor, reported_bonus_minor").eq("id", pid as string)).data ?? [];
    for (const u of [aRec, a, bOwn, b, bMgr]) expect(await read(u)).toEqual([{ reported_base_minor: 9_000_000, reported_bonus_minor: 1_000_000 }]);
    for (const u of [aCol, bCol, c]) expect(await read(u)).toEqual([]);
    expect(await read(platform)).toHaveLength(1);
    const { data: anonRead } = await anon().from("placements").select("reported_base_minor").eq("id", pid as string);
    expect(anonRead ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("fix round verification (P16, QA-N2-02, QA-N2-05, QA-PRE-01 backlog)", () => {
  const ctxFor = (u: TestUser, orgId: string) => ({ db: u.client, organizationId: orgId, userId: u.id }) as unknown as RequestContext;

  it("P16: an amendment between dialog open and submit, a missing, stale or foreign version → hire_terms_changed with nothing written", async () => {
    const job = await bJob();
    const ref = await created(job);
    const other = await created(job);
    await toOffer(ref);
    const shown = effectiveTerms(ref)!; // what the dialog rendered (the snapshot)
    const { data: amendId, error } = await amend(platform, ref, { p_rate_bps: 1500, p_guarantee_days: 90 });
    expect(error).toBeNull();
    const { data: otherAmend } = await amend(platform, other, { p_guarantee_days: 30 });
    const tryHire = (version: string | null | undefined) => hire(ref, { p_base_minor: 10_000_000, p_terms_version: version } as never);
    for (const v of [shown, null, undefined, randomUUID(), effectiveTerms(other)!, otherAmend as string, await termsOf(job)]) {
      expect((await tryHire(v)).error?.message, `version ${v}`).toMatch(/hire_terms_changed/);
    }
    expect((await referral(ref)).status).toBe("offer");
    expect(one(`select count(*) from public.placements where referral_id = '${ref}'`)).toBe("0");
    expect(one(`select count(*) from public.notifications where link like '/commissions/%' and body like '%' || (select job_title_snapshot from public.referrals where id = '${ref}') || '%' and created_at > now() - interval '1 minute'`)).toBe("0");
    // A colleague still learns nothing (forbidden before the version check).
    expect((await hire(ref, { p_base_minor: 10_000_000, p_terms_version: amendId as string } as never, bCol)).error?.message).toMatch(/not_found/);  // N3: was forbidden
    // The amended version the user now sees works and computes at 15%.
    const ok = await tryHire(amendId as string);
    expect(ok.error).toBeNull();
    expect(await placement(ok.data as string)).toMatchObject({ computed_fee_minor: 1_500_000, terms_version_id: amendId });
  });

  it("P16: a legacy referral refuses any p_terms_version (terms_not_recorded) and still hires without one", async () => {
    const job = await bJob();
    const ref = await created(job);
    await toOffer(ref);
    sql(`set session_replication_role = replica;
         update public.referrals set terms_version_id = null, commission_rule_id = null, fee_estimate_minor = null where id = '${ref}';
         update public.collaboration_agreements set terms_version_id = null where referral_id = '${ref}'`);
    expect((await hire(ref, { p_terms_version: await termsOf(job), p_legacy_fee_minor: 1_000_000, p_legacy_currency: "CAD" } as never)).error?.message).toMatch(/terms_not_recorded/);
    expect((await hire(ref, { p_terms_version: undefined, p_legacy_fee_minor: 1_000_000, p_legacy_currency: "CAD" } as never)).error).toBeNull();
  });

  it("QA-N2-02: I and base are bounded with hire_base_invalid; huge flat or minimum fees fail with a mapped code, never a raw overflow", async () => {
    const job = await bJob();
    const ref = await created(job);
    await toOffer(ref);
    // C = 2,000,000 → I must be within [20,000, 200,000,000].
    for (const args of [{ p_invoiced_fee_minor: 19_999 }, { p_invoiced_fee_minor: 200_000_001 }, { p_base_minor: 1_000_000_000_001, p_invoiced_fee_minor: undefined }]) {
      const r = await hire(ref, { p_base_minor: 10_000_000, p_difference_reason: "client_discount", ...args } as never);
      expect(r.error?.message, JSON.stringify(args)).toMatch(/hire_base_invalid/);
    }
    expect((await hire(ref, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 20_000, p_difference_reason: "client_discount" })).error).toBeNull();

  });

  // QA-N2-07 (MAJOR, fixed in 20261116000600): flat and minimum fees are bounded at 10^12 minor units.
  //  (a) report_hire's bound `v_i > v_c * 100` itself overflows → raw "bigint out of range";
  //  (b) get_opportunities computes the estimate share with allocate_minor, which overflows for such a job, so
  //      the WHOLE RPC fails for every partner whose candidates match it (one hiring org can blank other
  //      orgs' opportunities lists).
  // `.fails` dropped after the fix (backend, QA-N2-07).
  // Each case closes its job afterwards so it can't break other suites' opportunity lists.
  const close = (jobId: string) => sql(`update public.jobs set accepts_external_referrals = false where id = '${jobId}'`);
  const HUGE = [
    ["flat", { p_fee_basis: "flat", p_rate_bps: undefined, p_flat_fee_minor: 9_000_000_000_000_000_000, p_flat_currency: "CAD" }],
    ["minimum", { p_min_fee_minor: 9_000_000_000_000_000_000 }],
  ] as const;

  it.each(HUGE)("QA-N2-07a: a huge %s fee is refused at publish with terms_incomplete (never stored, never a raw overflow)", async (_label, terms) => {
    const j = await bJob({ accepts_external_referrals: false });
    try {
      await expect(publishTerms(bOwn, j, terms as never)).rejects.toThrow(/terms_incomplete/);
      // The 10^12 boundary itself is accepted.
      const ok = "p_fee_basis" in terms
        ? { ...terms, p_flat_fee_minor: 1_000_000_000_000 } : { p_min_fee_minor: 1_000_000_000_000 };
      expect(await publishTerms(bOwn, j, ok as never)).toMatchObject({ created: true });
      await expect(publishTerms(bOwn, j, ("p_fee_basis" in terms
        ? { ...terms, p_flat_fee_minor: 1_000_000_000_001 } : { p_min_fee_minor: 1_000_000_000_001 }) as never)).rejects.toThrow(/terms_incomplete/);
    } finally { close(j); }
  });

  it.each(HUGE)("QA-N2-07b: a huge %s fee can't enter through an amendment or a service-role insert", async (_label, terms) => {
    const job = await bJob();
    try {
      const ref = await created(job);
      const amendTerms = "p_fee_basis" in terms
        ? { p_fee_basis: "flat", p_rate_bps: null, p_flat_fee_minor: terms.p_flat_fee_minor, p_flat_currency: "CAD" }
        : { p_min_fee_minor: terms.p_min_fee_minor };
      expect((await amend(platform, ref, amendTerms)).error?.message).toMatch(/terms_incomplete/);
      const ins = await admin().from("job_terms_versions").insert({
        job_id: job, organization_id: orgB.id, kind: "job", version_no: 99, search_type: "contingent_shared", currency: "CAD",
        direct_client_attested_by: bOwn.id, direct_client_attested_at: new Date().toISOString(), guarantee_days: 0, payment_terms_days: 30,
        ownership_months: 6, created_by: bOwn.id,
        ...("p_fee_basis" in terms ? { fee_basis: "flat", flat_fee_minor: terms.p_flat_fee_minor } : { fee_basis: "pct_base", rate_bps: 2000, min_fee_minor: terms.p_min_fee_minor }),
      } as never);
      expect(ins.error?.message).toMatch(/job_terms_(flat|min)_fee_bound/);
    } finally { close(job); }
  });

  it("QA-N2-07c: an absurd salary band (still unbounded on jobs) fails closed per row: the list works, that row has no estimate, submitting still works", async () => {
    const normal = await bJob();
    const bad = await bJob({ share_salary: true, salary_min: 9_000_000_000_000_000_000, salary_max: 9_000_000_000_000_000_000 });
    try {
      const cid = await cand();
      await drainQueue();
      const { error } = await aRec.client.rpc("get_opportunities", { p_org: orgA.id, p_candidate: cid });
      expect(error).toBeNull();
      expect(await opportunityFor(aRec, orgA.id, cid, normal)).toBeDefined();
      const row = await opportunityFor(aRec, orgA.id, cid, bad);
      expect(row).toMatchObject({ estimated_fee_minor: null, estimated_share_minor: null });
      const ref = await submit(bad, await termsOf(bad), { candidateId: cid });
      expect(ref.data?.outcome).toBe("created");
      expect((await referral(ref.data!.referral_id!)).fee_estimate_minor).toBeNull();
    } finally { close(bad); close(normal); }
  });

  // QA-N2-09 (MAJOR, fixed in 20261116000700): app.terms_estimate returns 0 (not NULL) for a zero or tiny band
  // (greatest(round(...), 0)); the submit RPCs then insert fee_estimate_minor = 0, which violates
  // referrals.fee_estimate_minor > 0 inside the no-raise block, so EVERY partner's submission to the job returns
  // `failed`. The form and the connector both accept salary "0" (and a blank max). Drop `.fails` once fixed.
  it.each([
    ["0–0, recorded path", { salary_min: 0, salary_max: 0 }, "recorded"],
    ["min 0 / max blank, recorded path", { salary_min: 0, salary_max: null }, "recorded"],
    ["0–0, candidate path", { salary_min: 0, salary_max: 0 }, "candidate"],
  ] as const)("QA-N2-09: a %s with share_salary on still lets partners submit", async (_l, band, path) => {
    const job = await bJob({ share_salary: true, ...band });
    try {
      const r = path === "recorded" ? await submit(job, await termsOf(job)) : await submitForCandidate(job, await termsOf(job));
      expect(r.error).toBeNull();
      expect(r.data?.outcome).toBe("created");
    } finally { close(job); }
  });

  it("QA-N2-07e: the connector schema caps salaries at 10^10 major units (the API can't inject an absurd band)", async () => {
    const { jobInputSchema } = await import("@/server/ingest/schema");
    expect(jobInputSchema.safeParse({ title: "Imported", salary: { min: 1e11, max: 1e11 } }).success).toBe(false);
    expect(jobInputSchema.safeParse({ title: "Imported", salary: { min: 1e10, max: 1e10 } }).success).toBe(true);
  });

  // QA-N2-08 (minor, fixed in 20261116000700): record_payment_evidence has no upper bound; on the I >= C path
  // allocate_placement delegates to allocate_minor, which overflows raw ("bigint out of range"). Drop `.fails` once fixed.
  it("QA-N2-08: an absurd client payment amount fails with a mapped code, not a raw overflow", async () => {
    expect(() => sql(`select app.allocate_placement(9000000000000000000, 4500, 4500, 1000, 'collected', 1000, 1000)`)).toThrow(/invalid_fee/);
  });

  it("QA-N2-05: the expected share follows the effective terms (null after an amended % fee, exact after a flat amendment, unchanged after a non-fee amendment)", async () => {
    const mk = async () => {
      const job = await bJob({ share_salary: true, salary_min: 10_000_000, salary_max: 10_000_000 });
      return created(job);
    };
    const share = async (ref: string, u: TestUser = aRec, org = orgA.id) => {
      const t = await getReferralTerms(ctxFor(u, org), ref);
      return t && t.recorded ? t.expectedShareMinor : "legacy";
    };
    const a1 = await mk();
    expect(await share(a1)).toBe(900_000); // 45% of the frozen 2,000,000
    await amend(platform, a1, { p_guarantee_days: 30 });
    expect(await share(a1)).toBe(900_000);
    expect(await share(a1, bOwn, orgB.id)).toBe(900_000); // identical for both sides
    await amend(platform, a1, { p_rate_bps: 1500, p_guarantee_days: 30 });
    expect(await share(a1)).toBeNull();
    expect(await share(a1, bOwn, orgB.id)).toBeNull();
    const a2 = await mk();
    await amend(platform, a2, { p_fee_basis: "flat", p_rate_bps: null, p_flat_fee_minor: 1_000_000, p_flat_currency: "CAD" });
    expect(await share(a2)).toBe(450_000);
  });

  it("QA-PRE-01 backlog: a dead match.job doesn't block new work; requeueing it (or editing the job) now scores every existing candidate", async () => {
    const cands = await Promise.all(Array.from({ length: 3 }, () => cand()));
    const job = await bJob();
    const pending = () => sql(`select id from public.background_jobs where kind = 'match.job' and dedup_key = '${job}' and status = 'queued'`);
    // Simulate the pre-fix state: the job's matching died before scoring anyone.
    sql(`update public.background_jobs set status = 'dead', attempts = 5, last_error = 'URI too long' where kind = 'match.job' and dedup_key = '${job}' and status = 'queued'`);
    sql(`delete from public.matches where job_id = '${job}'`);
    expect(pending()).toEqual([]);
    // Recovery 1 (documented SQL): requeue dead match.job rows.
    sql(`update public.background_jobs set status = 'queued', attempts = 0, last_error = null, run_at = now() where kind = 'match.job' and dedup_key = '${job}' and status = 'dead'`);
    await drainQueue();
    const scored = () => Number(one(`select count(*) from public.matches where job_id = '${job}' and candidate_id in (${cands.map((x) => `'${x}'`).join(",")}) and expired_at is null`));
    expect(scored()).toBe(3);
    expect(one(`select count(*) from public.background_jobs where kind = 'match.job' and dedup_key = '${job}' and status = 'dead'`)).toBe("0");
    // Recovery 2: any matching-relevant edit enqueues a fresh job even with a dead row present.
    sql(`update public.background_jobs set status = 'dead' where kind = 'match.job' and dedup_key = '${job}' and status <> 'dead'`);
    expect((await bOwn.client.from("jobs").update({ description: `Updated ${uniq()}` }).eq("id", job)).error).toBeNull();
    expect(pending()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("fix round 3 verification (QA-N2-08, QA-N2-09) and zero / out-of-range money probes", () => {
  const close = (jobId: string) => sql(`update public.jobs set accepts_external_referrals = false where id = '${jobId}'`);
  it("a tiny band whose estimate rounds to 0 freezes no estimate and submits on both paths", async () => {
    const job = await bJob({ share_salary: true, salary_min: 1, salary_max: 1 });
    try {
      expect(one(`select coalesce(app.terms_estimate('pct_base', 2000, null, null, true, 1, 1)::text, 'null')`)).toBe("null");
      const r = await submit(job, await termsOf(job));
      expect(r.data?.outcome).toBe("created");
      expect((await referral(r.data!.referral_id!)).fee_estimate_minor).toBeNull();
      expect((await submitForCandidate(job, await termsOf(job))).data?.outcome).toBe("created");
      expect((await opportunityFor(aRec, orgA.id, await cand(), job))?.estimated_fee_minor ?? null).toBeNull();
    } finally { close(job); }
  });

  it("a hire whose computed fee rounds to 0 is refused with a mapped code (never a raw CHECK violation)", async () => {
    const job = await bJob();
    const ref = await created(job);
    await toOffer(ref);
    for (const args of [{ p_base_minor: 1 }, { p_base_minor: 1, p_invoiced_fee_minor: 1, p_difference_reason: "client_discount" }]) {
      const r = await hire(ref, args);
      expect(r.error?.message, JSON.stringify(args)).toMatch(/^(invalid_fee|hire_base_invalid)$/);
    }
    expect((await referral(ref)).status).toBe("offer");
  });

  it("payment evidence above 10^12 is refused with invalid_fee for the RPC and the service role; 10^12 is accepted", async () => {
    const job = await bJob();
    const ref = await created(job);
    await toOffer(ref);
    const pid = (await hire(ref, { p_base_minor: 10_000_000 })).data as string;
    const inv = await bOwn.client.rpc("record_invoice", { p_placement: pid, p_number: `INV-${uniq()}`, p_amount_minor: 2_000_000, p_tax_minor: 0, p_issued_on: "2027-01-11", p_due_on: "2027-02-10" });
    expect(inv.error).toBeNull();
    const rec = (amount: number) => bOwn.client.rpc("record_payment_evidence", {
      p_placement: pid, p_kind: "client_payment", p_amount_minor: amount, p_processing_fee_minor: 0, p_occurred_on: "2027-02-01",
      p_reference: `wire ${uniq()}`, p_notes: "", p_idempotency_key: randomUUID(),
    });
    expect((await rec(1_000_000_000_001)).error?.message).toMatch(/invalid_fee/);
    expect((await rec(1_000_000_000_000)).error).toBeNull();
    const svc = await admin().from("payment_evidence").insert({
      placement_id: pid, kind: "client_payment", amount_minor: 9_000_000_000_000_000, processing_fee_minor: 0, currency: "CAD",
      occurred_on: "2027-02-01", reference: `svc ${uniq()}`, recorded_by: bOwn.id, recorded_by_org: orgB.id, idempotency_key: randomUUID(),
    } as never);
    expect(svc.error?.message).toMatch(/invalid_fee/);
  });

  it("allocate_minor in exact numeric matches the TS allocateMinor near and at the 10^12 bound, for uneven splits", () => {
    const amounts = [1, 7, 999_999_999_999, 1_000_000_000_000, -1_000_000_000_000, -3, 123_456_789_011];
    const splits = [[4500, 4500, 1000], [3333, 3334, 3333], [0, 9000, 1000], [1, 1, 9998]];
    for (const p of amounts) for (const s of splits) {
      const sqlRow = sql(`select array_to_string(app.allocate_minor(${p}, array[${s.join(",")}]), ',')`)[0].split(",").map(Number);
      expect(sqlRow, `${p} ${s}`).toEqual(allocateMinor(p, s).map(Number));
    }
    expect(() => sql(`select app.allocate_placement(1000000000001, 4500, 4500, 1000, 'collected', null, 1)`)).toThrow(/invalid_fee/);
  });
});
