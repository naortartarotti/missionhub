import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  admin, anon, createCandidate, createJob, createOrg, createUser, drainQueue, issueCandidateToken, opportunityFor, publishTerms, sharingConsent, sql,
  termsOf, dbNow, type TestUser,
} from "./helpers";

/**
 * N2 job terms card, drop 1 (docs/specs/job-terms-card, brief rev. 2): publishing, immutability, the
 * partner-visibility gate on every surface, the snapshot at commit and `terms_changed`, the agreement
 * from the snapshot, ownership at delivery, the look-back and change notifications. Hire, ledger and
 * amendments: terms-hire-ledger.test.ts.
 */

let a: TestUser, a1: TestUser, b: TestUser, bRec: TestUser, bMgr: TestUser, c: TestUser, platform: TestUser;
let orgA: { id: string }, orgA1: { id: string }, orgB: { id: string }, orgC: { id: string };

const uniq = () => randomUUID().slice(0, 8);
const email = (p: string) => `${p}-${uniq()}@example.com`;
type Outcome = { outcome: string; referral_id: string | null; reference: string | null };

const bJob = (over: Record<string, unknown> = {}) => createJob(b, orgB.id, { title: `Terms ${uniq()}`, client_name: `Client ${uniq()}`, ...over });
const cand = (u: TestUser = a, orgId = orgA.id, over: Record<string, unknown> = {}) => createCandidate(u, orgId, { email: email("n2"), ...over });

async function submit(jobId: string, termsVersion: string | null, opts: { u?: TestUser; orgId?: string; candidateId?: string; ack?: boolean; key?: string } = {}) {
  const u = opts.u ?? a;
  const orgId = opts.orgId ?? orgA.id;
  const candidateId = opts.candidateId ?? (await cand(u, orgId));
  const consent = await sharingConsent(u, orgId, candidateId, jobId);
  const { data, error } = await u.client
    .rpc("submit_referral", {
      p_candidate: candidateId, p_job: jobId, p_terms_version: termsVersion as string, p_fields: ["headline", "skills"], p_document_ids: [],
      p_consent: consent, p_idempotency_key: opts.key ?? randomUUID(), p_acknowledge_pending: opts.ack ?? false,
    })
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as Outcome), candidateId };
}

async function submitForCandidate(jobId: string, termsVersion: string, u: TestUser = a, orgId = orgA.id, candidateId?: string) {
  const { data, error } = await u.client
    .rpc("submit_referral_for_candidate", {
      p_candidate: candidateId ?? (await cand(u, orgId)), p_job: jobId, p_terms_version: termsVersion, p_fields: ["headline", "skills"],
      p_document_ids: [], p_idempotency_key: randomUUID(),
    })
    .single();
  if (error) throw new Error(error.message);
  return data as Outcome & { created: boolean };
}

const one = (q: string) => sql(q)[0];
const referral = async (id: string) => (await admin().from("referrals").select("*").eq("id", id).single()).data!;
const versionCount = (jobId: string) => Number(one(`select count(*) from public.job_terms_versions where job_id = '${jobId}' and kind = 'job'`));
/** Opens a job WITHOUT a terms version, as every referral-open job was at migration time (BR-7). */
const openLegacy = (jobId: string) =>
  sql(`select set_config('app.job_terms_rpc', 'on', false); update public.jobs set accepts_external_referrals = true where id = '${jobId}'`);

beforeAll(async () => {
  [a, a1, b, bRec, bMgr, c, platform] = await Promise.all([
    createUser("n2-a"), createUser("n2-a1"), createUser("n2-b"), createUser("n2-brec"), createUser("n2-bmgr"), createUser("n2-c"),
    createUser("n2-admin", { platformAdmin: true }),
  ]);
  orgA = await createOrg(a, "N2 Agency A");
  orgA1 = await createOrg(a1, "N2 Agency A1");
  orgB = await createOrg(b, "N2 Hiring B");
  orgC = await createOrg(c, "N2 Other C");
  sql(`insert into public.organization_memberships (organization_id, user_id, role, status) values
       ('${orgB.id}', '${bRec.id}', 'recruiter', 'active'), ('${orgB.id}', '${bMgr.id}', 'recruiter_manager', 'active')`);
});

beforeEach(() => {
  sql(`delete from app.rate_limits where user_id in ('${a.id}', '${a1.id}', '${b.id}', '${bRec.id}', '${bMgr.id}', '${c.id}', '${platform.id}')`);
});

// ---------------------------------------------------------------------------------------------
describe("publishing terms (BR-1, BR-4, BR-5, BR-6)", () => {
  it("a no-op save creates no version; a change needs the attestation and creates the next one", async () => {
    const job = await bJob();
    expect(versionCount(job)).toBe(1);
    const same = await publishTerms(b, job);
    expect(same).toMatchObject({ created: false, version_no: 1 });
    await expect(publishTerms(b, job, { p_rate_bps: 2200, p_attested: false })).rejects.toThrow(/terms_attestation_required/);
    // Attestation isn't needed when nothing changes (PD-051 Q-2).
    expect(await publishTerms(b, job, { p_attested: false })).toMatchObject({ created: false });
    const v2 = await publishTerms(b, job, { p_rate_bps: 2200 });
    expect(v2).toMatchObject({ created: true, version_no: 2 });
    expect(versionCount(job)).toBe(2);
    expect(one(`select direct_client_attested_by from public.job_terms_versions where id = '${v2.terms_version_id}'`)).toBe(b.id);
    expect(sql(`select string_agg(version_no || ':' || created_by, ',' order by version_no) from public.job_terms_versions where job_id = '${job}'`)).toEqual([`1:${b.id},2:${b.id}`]);
  });

  it("only the job's owner or a manager may publish; anyone else gets not_found (RD-012)", async () => {
    const job = await bJob();
    for (const u of [bRec, c, a]) await expect(publishTerms(u, job)).rejects.toThrow(/not_found/);
    expect(await publishTerms(bMgr, job)).toMatchObject({ created: false });
  });

  it("refuses incomplete cards and opening a non-permanent job, drafts included", async () => {
    const job = await bJob({ accepts_external_referrals: false, contract_type: "contract", status: "draft" });
    await expect(publishTerms(b, job)).rejects.toThrow(/referrals_require_permanent/);
    // A private job may hold a card without being opened.
    expect(await publishTerms(b, job, {}, false)).toMatchObject({ created: true, version_no: 1 });
    const open = await bJob();
    await expect(publishTerms(b, open, { p_rate_bps: 50 })).rejects.toThrow(/terms_incomplete/);
    await expect(publishTerms(b, open, { p_fee_basis: "flat", p_rate_bps: undefined, p_flat_fee_minor: 1_000_000, p_flat_currency: "JPY" })).rejects.toThrow(/terms_incomplete/);
    await expect(publishTerms(b, open, { p_guarantee_days: 0 })).rejects.toThrow(/terms_incomplete/); // remedy must be null with 0 days
    await expect(publishTerms(b, open, { p_ownership_months: 13 })).rejects.toThrow(/terms_incomplete/);
    await expect(publishTerms(b, open, { p_payment_terms_days: 91 })).rejects.toThrow(/terms_incomplete/);
    const { error } = await b.client.rpc("save_job_terms", { p_job: open, p_open: true });
    expect(error?.message).toMatch(/terms_incomplete/);
  });

  it("% bases take the job's salary currency; flat declares one of five; closing keeps every version", async () => {
    const usd = await bJob({ salary_currency: "USD" });
    expect(one(`select currency from public.job_terms_versions where job_id = '${usd}'`)).toBe("USD");
    const flat = await bJob({ accepts_external_referrals: false });
    await publishTerms(b, flat, { p_fee_basis: "flat", p_rate_bps: undefined, p_flat_fee_minor: 1_500_000, p_flat_currency: "eur" });
    expect(one(`select currency || ':' || flat_fee_minor from public.job_terms_versions where job_id = '${flat}'`)).toBe("EUR:1500000");
    const { error } = await b.client.rpc("save_job_terms", { p_job: flat, p_open: false });
    expect(error).toBeNull();
    expect(one(`select accepts_external_referrals from public.jobs where id = '${flat}'`)).toBe("f");
    expect(versionCount(flat)).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("immutability and the referral-flag guard (BR-4)", () => {
  it("versions can't be inserted, updated or deleted directly by any role", async () => {
    const job = await bJob();
    const v = await termsOf(job);
    expect((await b.client.from("job_terms_versions").update({ rate_bps: 5000 } as never).eq("id", v)).error).not.toBeNull();
    expect((await b.client.from("job_terms_versions").delete().eq("id", v)).error).not.toBeNull();
    expect((await b.client.from("job_terms_versions").insert({ job_id: job } as never)).error?.code).toBe("42501");
    expect((await admin().from("job_terms_versions").update({ rate_bps: 5000 }).eq("id", v)).error).not.toBeNull();
    expect((await admin().from("job_terms_versions").delete().eq("id", v)).error).not.toBeNull();
    expect(one(`select rate_bps from public.job_terms_versions where id = '${v}'`)).toBe("2000");
  });

  it("no path but save_job_terms can open a job: user PATCH, service-role insert and update are refused", async () => {
    const job = await bJob({ accepts_external_referrals: false });
    await publishTerms(b, job, {}, false);
    const patch = await b.client.from("jobs").update({ accepts_external_referrals: true }).eq("id", job);
    expect(patch.error?.message).toMatch(/terms_incomplete/);
    const svc = await admin().from("jobs").update({ accepts_external_referrals: true }).eq("id", job);
    expect(svc.error?.message).toMatch(/terms_incomplete/);
    const ins = await admin().from("jobs").insert({
      organization_id: orgB.id, owner_id: b.id, created_by: b.id, title: "Imported open", description: "x", accepts_external_referrals: true, source: "api",
    });
    expect(ins.error?.message).toMatch(/terms_incomplete/);
    // A connector-style write (service role, no flag) still works and leaves the job private.
    const ok = await admin().from("jobs").insert({ organization_id: orgB.id, owner_id: b.id, created_by: b.id, title: "Imported", description: "x", source: "api" }).select("accepts_external_referrals").single();
    expect(ok.data?.accepts_external_referrals).toBe(false);
  });

  it("the referral snapshot can't be edited after commit, even by the service role (BR-13)", async () => {
    const job = await bJob();
    const r = await submit(job, await termsOf(job));
    const upd = await admin().from("referrals").update({ fee_estimate_minor: 1 } as never).eq("id", r.referral_id!);
    expect(upd.error?.message).toMatch(/immutable/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("partner visibility on every surface (BR-3, BR-7)", () => {
  let visible: string, legacy: string, contract: string, mismatch: string, suspended: string, candidate: string;
  let orgD: { id: string };
  let d: TestUser;

  beforeAll(async () => {
    visible = await bJob();
    legacy = await bJob({ accepts_external_referrals: false });
    openLegacy(legacy);
    contract = await bJob();
    await admin().from("jobs").update({ contract_type: "contract" }).eq("id", contract);
    mismatch = await bJob();
    await admin().from("jobs").update({ salary_currency: "USD" }).eq("id", mismatch);
    d = await createUser("n2-d");
    orgD = await createOrg(d, "N2 Suspended D");
    suspended = await createJob(d, orgD.id, { title: `Susp ${uniq()}` });
    candidate = await cand();
    await drainQueue();
    await admin().from("organizations").update({ suspended_at: new Date().toISOString() }).eq("id", orgD.id);
  });

  it("opportunities list only partner-visible jobs, with the current card and T10", async () => {
    // Per pair (p_match): the full list is capped at PostgREST max_rows on a large local data set.
    const row = (await opportunityFor(a, orgA.id, candidate, visible))!;
    expect(row).toBeDefined();
    for (const hidden of [legacy, contract, mismatch, suspended]) expect(await opportunityFor(a, orgA.id, candidate, hidden)).toBeUndefined();
    expect(row).toMatchObject({ terms_version_id: await termsOf(visible), terms_version_no: 1, terms_updated_at: null, fee_basis: "pct_base", rate_bps: 2000, fee_currency: "CAD", ownership_months: 6, sourcing_bps: 4500, platform_bps: 1000 });
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["client_key", "expected_fee_minor", "your_share_minor"]));
  });

  it("both submit RPCs refuse hidden jobs (direct calls) with the same 'not open' answer", async () => {
    for (const hidden of [legacy, contract, mismatch, suspended]) {
      const terms = await termsOf(hidden);
      await expect(submit(hidden, terms)).rejects.toThrow(/job_not_open_for_referrals/);
      await expect(submitForCandidate(hidden, terms)).rejects.toThrow(/job_not_open_for_referrals/);
    }
  });

  it("triage and seen-marks treat matches of hidden jobs as missing", async () => {
    const { data: m } = await admin().from("matches").select("id, job_id").eq("candidate_id", candidate).in("job_id", [legacy, visible]);
    const hiddenMatch = m!.find((x) => x.job_id === legacy)!;
    const okMatch = m!.find((x) => x.job_id === visible)!;
    expect((await a.client.rpc("set_match_triage", { p_org: orgA.id, p_match: hiddenMatch.id, p_state: "saved" })).error?.message).toMatch(/not_found/);
    expect((await a.client.rpc("set_match_triage", { p_org: orgA.id, p_match: okMatch.id, p_state: "saved" })).error).toBeNull();
    await a.client.rpc("mark_matches_seen", { p_org: orgA.id, p_matches: [hiddenMatch.id] });
    expect(one(`select count(*) from public.match_triage where match_id = '${hiddenMatch.id}'`)).toBe("0");
  });

  it("the owner sees why a job is hidden; other orgs get forbidden, never a reason", async () => {
    const { data, error } = await b.client.rpc("get_jobs_terms_state", { p_org: orgB.id });
    expect(error).toBeNull();
    const reason = (id: string) => data!.find((x) => x.job_id === id)!;
    expect(reason(visible)).toMatchObject({ partner_visible: true, hidden_reason: null, version_no: 1 });
    expect(reason(legacy)).toMatchObject({ partner_visible: false, hidden_reason: "no_terms", terms_version_id: null });
    expect(reason(contract).hidden_reason).toBe("not_permanent");
    expect(reason(mismatch).hidden_reason).toBe("currency_mismatch");
    expect((await a.client.rpc("get_jobs_terms_state", { p_org: orgB.id })).error?.message).toMatch(/forbidden/);
  });

  it("admin metrics count partner-visible jobs and open jobs hidden for missing terms", async () => {
    const { data } = await platform.client.rpc("presentation_admin_metrics", { p_days: 30 });
    const m = data as Record<string, number>;
    expect(m.partner_visible_jobs).toBeGreaterThan(0);
    expect(m.referral_open_without_terms).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe("snapshot at commit and terms_changed (BR-11 to BR-15)", () => {
  it("a stale, foreign or missing version returns terms_changed with nothing but an audit event; the current one commits the snapshot", async () => {
    const job = await bJob({ share_salary: true, salary_min: 9_000_000, salary_max: 11_000_000 });
    const v1 = await termsOf(job);
    await publishTerms(b, job, { p_rate_bps: 2500 });
    const v2 = await termsOf(job);
    const other = await termsOf(await bJob());
    const candidateId = await cand();
    const before = Number(one(`select count(*) from app.presentation_hits where source_org_id = '${orgA.id}'`));
    for (const stale of [v1, other, randomUUID()]) {
      const key = randomUUID();
      const r = await submit(job, stale, { candidateId, key });
      expect(r).toMatchObject({ outcome: "terms_changed", referral_id: null });
      expect((await admin().from("referrals").select("id").eq("idempotency_key", key)).data).toHaveLength(0);
    }
    expect(Number(one(`select count(*) from app.presentation_hits where source_org_id = '${orgA.id}'`))).toBe(before);
    expect(one(`select count(*) from app.referral_fingerprints f join app.referral_presentations p on p.referral_id = f.referral_id where p.candidate_id = '${candidateId}'`)).toBe("0");
    const audit = await a.client.from("audit_events").select("metadata").eq("entity_id", job).eq("action", "referral.terms_changed");
    expect(audit.data).toHaveLength(3);
    expect(audit.data!.every((x) => JSON.stringify(x.metadata) === "{}")).toBe(true);
    // terms_changed counts toward the 30/h submit limit (PD-051 Q6).
    expect(Number(one(`select coalesce(sum(hits), 0) from app.rate_limits where user_id = '${a.id}' and bucket = 'referral.submit'`))).toBe(3);

    const ok = await submit(job, v2, { candidateId });
    expect(ok.outcome).toBe("created");
    const r = await referral(ok.referral_id!);
    const rule = one(`select id from public.commission_rules where is_default and retired_at is null`);
    expect(r).toMatchObject({ terms_version_id: v2, commission_rule_id: rule, fee_estimate_minor: 2_500_000 });
    const clientName = one(`select client_name from public.jobs where id = '${job}'`);
    expect(one(`select client_key = app.client_key('${clientName.replace(/'/g, "''")}') from app.referral_commit_keys where referral_id = '${r.id}'`)).toBe("t");
    // Neither side can read the commit key.
    expect((await a.client.schema("app" as never).from("referral_commit_keys" as never).select("*")).error).not.toBeNull();
  });

  it("the frozen estimate is what A was shown: none when the band is private; the flat amount on flat; never re-read", async () => {
    const hidden = await bJob({ share_salary: false, salary_min: 9_000_000, salary_max: 11_000_000 });
    expect((await referral((await submit(hidden, await termsOf(hidden))).referral_id!)).fee_estimate_minor).toBeNull();
    const flat = await bJob({ accepts_external_referrals: false });
    await publishTerms(b, flat, { p_fee_basis: "flat", p_rate_bps: undefined, p_flat_fee_minor: 1_800_000, p_flat_currency: "CAD" });
    expect((await referral((await submit(flat, await termsOf(flat))).referral_id!)).fee_estimate_minor).toBe(1_800_000);
    const shown = await bJob({ share_salary: true, salary_min: 10_000_000, salary_max: 10_000_000 });
    const id = (await submit(shown, await termsOf(shown))).referral_id!;
    await b.client.from("jobs").update({ salary_min: 1, salary_max: 2, share_salary: false }).eq("id", shown);
    expect((await referral(id)).fee_estimate_minor).toBe(2_000_000);
  });

  it("candidate-confirmed: the version at request time survives a terms change and a resend; ownership = delivery + its window (BR-14, BR-18)", async () => {
    const job = await bJob();
    const v1 = await termsOf(job);
    const out = await submitForCandidate(job, v1);
    expect(out.outcome).toBe("created");
    expect((await referral(out.referral_id!)).ownership_protected_until).toBeNull(); // undelivered: no date (BR-19)
    await publishTerms(b, job, { p_ownership_months: 12 });
    expect((await a.client.rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_ttl_days: 14 })).error).toBeNull();
    const token = await issueCandidateToken(out.referral_id!, a.id);
    const { data } = await anon().rpc("respond_candidate_request", { p_token: token, p_accept: true, p_profile: {} as never });
    expect(data).toBe("confirmed");
    const r = await referral(out.referral_id!);
    expect(r.terms_version_id).toBe(v1);
    expect(one(`select ownership_protected_until = app.add_months_et(delivered_at, 6) from public.referrals where id = '${r.id}'`)).toBe("t");
  });

  it("N1's pending warning: the acknowledged second call re-checks the version (BR-12)", async () => {
    const job = await bJob();
    const shared = email("pend");
    const pending = await submitForCandidate(job, await termsOf(job), a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }));
    expect(pending.outcome).toBe("created");
    const mine = await cand(a, orgA.id, { email: shared });
    const v1 = await termsOf(job);
    expect((await submit(job, v1, { candidateId: mine })).outcome).toBe("pending_warning");
    await publishTerms(b, job, { p_payment_terms_days: 45 });
    expect((await submit(job, v1, { candidateId: mine, ack: true })).outcome).toBe("terms_changed");
    expect((await submit(job, await termsOf(job), { candidateId: mine, ack: true })).outcome).toBe("created");
  });
});

// ---------------------------------------------------------------------------------------------
describe("agreement from the snapshot (BR-16, BR-17)", () => {
  it("a rule published between submission and acceptance doesn't change the agreement", async () => {
    const job = await bJob();
    const r = await submit(job, await termsOf(job));
    const commitRule = (await referral(r.referral_id!)).commission_rule_id;
    // Same percentages (other suites run in parallel and assume 45/45/10); only the rule id differs.
    const { data: newRule, error: pErr } = await platform.client.rpc("publish_commission_rule", { p_name: `N2 test rule ${uniq()}`, p_sourcing: 4500, p_job_owner: 4500, p_platform: 1000 });
    expect(pErr).toBeNull();
    expect(newRule).not.toBe(commitRule);
    try {
      const v = (await referral(r.referral_id!)).version;
      expect((await b.client.rpc("transition_referral", { p_referral: r.referral_id!, p_to: "accepted", p_reason: "", p_expected_version: v })).error).toBeNull();
      const { data: ag } = await admin().from("collaboration_agreements").select("*").eq("referral_id", r.referral_id!).single();
      expect(ag).toMatchObject({ rule_id: commitRule, sourcing_bps: 4500, job_owner_bps: 4500, platform_bps: 1000, terms_version_id: await termsOf(job), platform_basis: "collected" });
    } finally {
      // Restore a 45/45/10 default for the other suites.
      await platform.client.rpc("publish_commission_rule", { p_name: "Standard marketplace split", p_sourcing: 4500, p_job_owner: 4500, p_platform: 1000 });
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("ownership window (BR-18, BR-19) and legacy delivery (BR-3 exception, BR-7)", () => {
  it("calendar months in Toronto, clamped to the month's end", () => {
    const at = (ts: string, n: number) => one(`select to_char(app.add_months_et('${ts}'::timestamptz, ${n}) at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI')`);
    expect(at("2026-08-31 15:00 America/Toronto", 6)).toBe("2027-02-28 15:00");
    expect(at("2027-01-31 09:30 America/Toronto", 1)).toBe("2027-02-28 09:30");
    expect(at("2028-01-31 09:30 America/Toronto", 1)).toBe("2028-02-29 09:30");
    expect(at("2026-03-01 10:00 America/Toronto", 12)).toBe("2027-03-01 10:00");
  });

  it("recorded path: ownership = delivery + the snapshot's window", async () => {
    const job = await bJob({ accepts_external_referrals: false });
    await publishTerms(b, job, { p_ownership_months: 9 });
    const r = await submit(job, await termsOf(job));
    expect(one(`select ownership_protected_until = app.add_months_et(delivered_at, 9) from public.referrals where id = '${r.referral_id}'`)).toBe("t");
  });

  it("a legacy pending referral on a hidden job is delivered on confirmation with 12 months; a snapshot one is refused", async () => {
    const job = await bJob();
    const legacyOut = await submitForCandidate(job, await termsOf(job));
    const snapOut = await submitForCandidate(job, await termsOf(job));
    // Simulate a pre-N2 referral (no snapshot); triggers are bypassed for this test setup only.
    sql(`set session_replication_role = replica;
         update public.referrals set terms_version_id = null, commission_rule_id = null, fee_estimate_minor = null where id = '${legacyOut.referral_id}';
         delete from app.referral_commit_keys where referral_id = '${legacyOut.referral_id}'`);
    await admin().from("jobs").update({ contract_type: "contract" }).eq("id", job); // no longer partner-visible
    const legacyToken = await issueCandidateToken(legacyOut.referral_id!, a.id);
    const snapToken = await issueCandidateToken(snapOut.referral_id!, a.id);
    const ok = await anon().rpc("respond_candidate_request", { p_token: legacyToken, p_accept: true, p_profile: {} as never });
    expect(ok.data).toBe("confirmed");
    expect(one(`select ownership_protected_until = app.add_months_et(delivered_at, 12) from public.referrals where id = '${legacyOut.referral_id}'`)).toBe("t");
    const refused = await anon().rpc("respond_candidate_request", { p_token: snapToken, p_accept: true, p_profile: {} as never });
    expect(refused.error?.message).toMatch(/job_not_open_for_referrals/);
  });

  it("no undelivered referral carries an ownership date (PD-051 Q2)", () => {
    expect(one(`select count(*) from public.referrals where delivered_at is null and ownership_protected_until is not null`)).toBe("0");
  });
});

// ---------------------------------------------------------------------------------------------
describe("prior-presentation look-back follows the window (BR-20)", () => {
  const pdf = () => new TextEncoder().encode(`%PDF-1.4\n% evidence ${uniq()}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
  async function readyFile(referralId: string) {
    const path = `${orgB.id}/${referralId}/${randomUUID()}.pdf`;
    const up = await b.client.storage.from("claim-evidence").upload(path, pdf(), { contentType: "application/pdf", upsert: false });
    if (up.error) throw new Error(up.error.message);
    const { data, error } = await b.client.rpc("register_claim_evidence", { p_referral: referralId, p_storage_path: path, p_file_name: "ats.pdf", p_acting_org: orgB.id });
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }
  async function claim(months: number) {
    const job = await bJob({ accepts_external_referrals: false });
    await publishTerms(b, job, { p_ownership_months: months });
    const ref = (await submit(job, await termsOf(job))).referral_id!;
    const file = await readyFile(ref);
    await drainQueue();
    const pres = (await b.client.rpc("get_referral_presentation", { p_referral: ref, p_acting_org: orgB.id })).data as Record<string, unknown>;
    const delivered = one(`select (delivered_at at time zone 'America/Toronto')::date from public.referrals where id = '${ref}'`);
    const elevenMonthsBack = one(`select ('${delivered}'::date - interval '11 months')::date`);
    const res = await b.client.rpc("file_prior_presentation_claim", {
      p_referral: ref, p_expected_version: (await referral(ref)).version, p_evidence_kind: "file", p_file_ids: [file], p_evidence_referral: null as never,
      p_prior_process_date: elevenMonthsBack, p_attested: true, p_note: "", p_acting_org: orgB.id,
    });
    return { pres, delivered, res };
  }

  it("a 12-month window accepts a prior-process date 11 months back; the hiring side gets the bound", async () => {
    const { pres, delivered, res } = await claim(12);
    expect(res.error).toBeNull();
    expect(pres.lookback_months).toBe(12);
    expect(pres.claim_prior_date_min).toBe(one(`select ('${delivered}'::date - interval '12 months')::date`));
  });

  it("a 6-month window refuses it", async () => {
    const { pres, res } = await claim(6);
    expect(res.error?.message).toMatch(/claim_date_invalid/);
    expect(pres.lookback_months).toBe(6);
  });
});

// ---------------------------------------------------------------------------------------------
describe("terms changes notify partners with live referrals (BR-32)", () => {
  it("one notification to the submitter of each source org with a live referral; none for closed ones or v1", async () => {
    const job = await bJob();
    const live = await submit(job, await termsOf(job));
    const closed = await submit(job, await termsOf(job), { u: c, orgId: orgC.id });
    const v = (await referral(closed.referral_id!)).version;
    expect((await c.client.rpc("withdraw_referral", { p_referral: closed.referral_id!, p_reason: "Candidate took another offer", p_expected_version: v, p_acting_org: orgC.id })).error).toBeNull();
    const since = dbNow();
    const res = await publishTerms(b, job, { p_guarantee_days: 60 });
    expect(res).toMatchObject({ created: true, version_no: 2, notified_orgs: 1 });
    const { data } = await admin().from("notifications").select("user_id, organization_id, title, body, link").eq("kind", "job.terms_changed").gte("created_at", since);
    expect(data!.map((n) => n.organization_id)).toEqual([orgA.id]);
    expect(data![0].user_id).toBe(a.id);
    const title = one(`select title from public.jobs where id = '${job}'`);
    expect(data![0].body).toBe(`N2 Hiring B updated the terms for ${title}. Your referrals keep the terms they were sent under.`);
    expect(data![0].link).toBe(`/referrals/${live.referral_id}`);
    // "Terms updated on {date}" for 30 days after any version other than the first (BR-33).
    const { data: opp } = await a.client.rpc("get_opportunities", { p_org: orgA.id });
    const row = opp!.find((o) => o.job_id === job);
    if (row) expect(row.terms_updated_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe("fee bounds and a fail-closed estimate (QA-N2-07)", () => {
  it("flat and minimum fees above 10^12 minor units are refused with terms_incomplete; 10^12 is accepted", async () => {
    const job = await bJob({ accepts_external_referrals: false });
    const flat = { p_fee_basis: "flat" as const, p_rate_bps: undefined, p_flat_currency: "CAD" };
    await expect(publishTerms(b, job, { ...flat, p_flat_fee_minor: 1_000_000_000_001 })).rejects.toThrow(/terms_incomplete/);
    await expect(publishTerms(b, job, { p_min_fee_minor: 1_000_000_000_001 })).rejects.toThrow(/terms_incomplete/);
    expect(await publishTerms(b, job, { ...flat, p_flat_fee_minor: 1_000_000_000_000 })).toMatchObject({ created: true });
    // Every writer is bounded by the check constraints.
    const v = await termsOf(job);
    expect(() => sql(`insert into public.job_terms_versions (job_id, organization_id, version_no, fee_basis, flat_fee_minor, currency, search_type,
        direct_client_attested_by, direct_client_attested_at, guarantee_days, payment_terms_days, ownership_months, created_by)
      select job_id, organization_id, 99, 'flat', 9000000000000000000, 'CAD', search_type, direct_client_attested_by, now(), 0, 30, 6, created_by
        from public.job_terms_versions where id = '${v}'`)).toThrow(/job_terms_flat_fee_bound/);
  });

  it("an absurd salary band on one job gives that row no estimate and never fails the list", async () => {
    const normal = await bJob();
    const absurd = await bJob({ share_salary: true, salary_min: 9_000_000_000_000_000_000, salary_max: 9_000_000_000_000_000_000 });
    const candidate = await cand();
    await drainQueue();
    try {
      const { data, error } = await a.client.rpc("get_opportunities", { p_org: orgA.id, p_candidate: candidate });
      expect(error).toBeNull();
      const ids = new Set(data!.map((o) => o.job_id));
      expect(ids.has(normal)).toBe(true);
      const row = data!.find((o) => o.job_id === absurd);
      if (row) expect([row.estimated_fee_minor, row.estimated_share_minor]).toEqual([null, null]);
      // Submitting freezes no estimate rather than failing.
      const r = await submit(absurd, await termsOf(absurd), { candidateId: candidate });
      expect(r.outcome).toBe("created");
      expect((await referral(r.referral_id!)).fee_estimate_minor).toBeNull();
    } finally {
      sql(`update public.jobs set accepts_external_referrals = false where id in ('${absurd}', '${normal}')`);
    }
  });
});

describe("zero salary band (QA-N2-09)", () => {
  it("a 0–0 band with share_salary on gives no estimate, and both paths still submit", async () => {
    const job = await bJob({ share_salary: true, salary_min: 0, salary_max: 0 });
    try {
      const r = await submit(job, await termsOf(job));
      expect(r.outcome).toBe("created");
      expect((await referral(r.referral_id!)).fee_estimate_minor).toBeNull();
      const c2 = await submitForCandidate(job, await termsOf(job));
      expect(c2.outcome).toBe("created");
      expect(one(`select app.terms_estimate('pct_base', 2000, null, null, true, 0, null) is null`)).toBe("t");
    } finally {
      sql(`update public.jobs set accepts_external_referrals = false where id = '${job}'`);
    }
  });
});
