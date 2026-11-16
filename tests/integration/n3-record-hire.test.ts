import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { admin, anon, createCandidate, createJob, createOrg, createUser, dbNow, effectiveTerms, opportunityFor, publishTerms, sharingConsent, sql, termsOf, type TestUser } from "./helpers";
import { clientKey } from "@/lib/client-key";

/**
 * N3 drop 1 (docs/specs/referral-claims-two-sided-hire, backend.md v1): prerequisites (BR-1, BR-2), the hiring
 * side's hire record from any counting referral (BR-3, BR-4, BR-7 to BR-15, BR-45), fee-pending placements
 * (BR-31, BR-32), release from declined / rejected (BR-34), the side-shaped hire state (BR-11, BR-35), admin
 * hire-record note and tasks (BR-12, BR-13, BR-31). `deemed_agreement_enabled` is false by default; tests turn
 * it on per case through SQL (the service-role path) and always restore it.
 */

let a: TestUser, b: TestUser, bMgr: TestUser, bRec: TestUser, c: TestUser, platform: TestUser;
let orgA: { id: string }, orgB: { id: string };
const uniq = () => randomUUID().slice(0, 8);
const one = (q: string) => sql(q)[0];
const referral = async (id: string) => (await admin().from("referrals").select("*").eq("id", id).single()).data!;
const flag = (on: boolean) => sql(`update app.platform_settings set value = '${on}'::jsonb where key = 'deemed_agreement_enabled'`);
const BASE = 10_000_000; // CAD 100,000.00 → C = 2,000,000 at the fixture's 20 %

beforeAll(async () => {
  [a, b, bMgr, bRec, c, platform] = await Promise.all([
    createUser("n3-a"), createUser("n3-b"), createUser("n3-bmgr"), createUser("n3-brec"), createUser("n3-c"), createUser("n3-admin", { platformAdmin: true }),
  ]);
  orgA = await createOrg(a, "N3 Agency A");
  orgB = await createOrg(b, "N3 Hiring B");
  await createOrg(c, "N3 Other C");
  for (const [u, role] of [[bMgr, "recruiter_manager"], [bRec, "recruiter"]] as const) {
    const { error } = await admin().from("organization_memberships").insert({ organization_id: orgB.id, user_id: u.id, role, status: "active" });
    if (error) throw error;
  }
});
beforeEach(() => sql(`delete from app.rate_limits where user_id in ('${a.id}', '${b.id}', '${bMgr.id}', '${bRec.id}', '${c.id}', '${platform.id}')`));
afterEach(() => flag(false));

/** A job of B with the default card, and a delivered referral from A on it (recorded path). */
async function referred(jobOver: Record<string, unknown> = {}, terms: Parameters<typeof publishTerms>[2] = {}) {
  const job = await createJob(b, orgB.id, { title: `N3 ${uniq()}`, client_name: `Client ${uniq()}`, accepts_external_referrals: false, ...jobOver });
  await publishTerms(b, job, terms);
  const cand = await createCandidate(a, orgA.id, { email: `n3-${uniq()}@example.com` });
  const consent = await sharingConsent(a, orgA.id, cand, job);
  const { data, error } = await a.client.rpc("submit_referral", {
    p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline", "skills"], p_document_ids: [],
    p_consent: consent, p_idempotency_key: randomUUID(),
  }).single();
  if (error || data?.outcome !== "created") throw new Error(error?.message ?? data?.outcome);
  return { job, cand, referralId: data.referral_id! };
}
const move = async (referralId: string, to: string, u: TestUser = b) => {
  const reason = ["declined", "rejected", "withdrawn", "cancelled"].includes(to) ? "Not the right fit for this role." : "";
  const { error } = await u.client.rpc("transition_referral", { p_referral: referralId, p_to: to as never, p_reason: reason, p_expected_version: (await referral(referralId)).version });
  if (error) throw new Error(`${to}: ${error.message}`);
};
const confirm = async (referralId: string) => {
  const { error } = await a.client.rpc("confirm_agreement", { p_referral: referralId });
  if (error) throw new Error(error.message);
};
/** Accepted and confirmed by A: an active agreement. */
const withAgreement = async (referralId: string) => {
  await move(referralId, "accepted");
  await confirm(referralId);
};
type HireArgs = Record<string, unknown>;
const hire = async (referralId: string, args: HireArgs = {}, u: TestUser = b) =>
  u.client.rpc("report_hire", {
    p_referral: referralId, p_start_date: today(), p_expected_version: (await referral(referralId)).version,
    p_terms_version: effectiveTerms(referralId), p_base_minor: BASE, ...args,
  } as never);
const today = () => one(`select (now() at time zone 'America/Toronto')::date::text`);
const daysAgo = (n: number) => one(`select ((now() at time zone 'America/Toronto')::date - ${n})::text`);
const hireRecord = (referralId: string) => sql(`select kind || '|' || coalesce(placement_id::text, '-') || '|' || prior_status || '|' || coalesce(hired_role_title, '-')
                                                 from public.hire_records where referral_id = '${referralId}'`)[0];
const late = (referralId: string) => one(`select x.late from app.hire_record_admin x join public.hire_records h on h.id = x.hire_record_id where h.referral_id = '${referralId}'`);
const replica = (q: string) => sql(`set session_replication_role = replica; ${q}`);
const notes = (userId: string, kind: string, since: string) =>
  sql(`select body from public.notifications where user_id = '${userId}' and kind = '${kind}' and created_at >= '${since}'`);
/** Seeds the hiring side's own prior-presentation objection (N1) in a given state. */
const objection = (referralId: string, status: "open" | "contested" | "rejected" | "upheld", deadlineDays = 3) =>
  sql(`insert into app.referral_claims (referral_id, source_org_id, target_org_id, filed_by, evidence_kind, prior_process_date, attested_at,
         contest_deadline_at, status, resolved_at)
       select r.id, r.source_org_id, r.target_org_id, '${b.id}', 'file', current_date - 10, now(), now() + interval '${deadlineDays} days',
              '${status}', case when '${status}' in ('rejected', 'upheld') then now() end
         from public.referrals r where r.id = '${referralId}'`);

// ---------------------------------------------------------------------------------------------
describe("BR-1 client-name gate", () => {
  it("opening a job to partners needs a real client name, through every path; drafts too (AC-1, AC-4)", async () => {
    for (const name of [null, "", "Confidential", "N/A", "TBD", "Client confidentiel", "Stealth Startup Inc."]) {
      const job = await createJob(b, orgB.id, { title: `Gate ${uniq()}`, client_name: name, accepts_external_referrals: false, status: "draft" });
      const { error } = await b.client.rpc("save_job_terms", { p_job: job, p_open: true, p_fee_basis: "pct_base", p_rate_bps: 2000, p_search_type: "contingent_shared",
        p_attested: true, p_guarantee_days: 90, p_guarantee_remedy: "replacement_then_prorata", p_payment_terms_days: 30, p_ownership_months: 6 });
      expect(error?.message, String(name)).toMatch(/^client_name_required_for_referrals/);
      // Nothing was saved: no version, still closed.
      expect(one(`select count(*) from public.job_terms_versions where job_id = '${job}'`)).toBe("0");
      expect(one(`select accepts_external_referrals from public.jobs where id = '${job}'`)).toBe("f");
    }
    // A real name with "Hide client" ticked opens; the name reaches no partner payload.
    const { job, cand } = await referred({ client_name: "Acme Robotics Ltd", client_confidential: true });
    expect(one(`select accepts_external_referrals from public.jobs where id = '${job}'`)).toBe("t");
    await sql(`select 1`);
    const opp = await opportunityFor(a, orgA.id, cand, job);
    expect(JSON.stringify(opp ?? {})).not.toMatch(/Acme/i);
    // Connector / service-role paths: created and saved without a name, never opened (AC-4).
    const { data: raw, error: insErr } = await admin().from("jobs").insert({ organization_id: orgB.id, owner_id: b.id, created_by: b.id, title: "API job", status: "active",
      work_arrangement: "remote", accepts_external_referrals: true }).select("id");
    expect(raw).toBeNull();
    expect(insErr?.message).toMatch(/client_name_required_for_referrals|terms_incomplete|referral flag/);
    // The gate holds on its own too: the service role flipping the flag on a keyless job (N2's guard bypassed the
    // way save_job_terms does) is refused with the N3 code.
    const keyless = await createJob(b, orgB.id, { title: `Keyless ${uniq()}`, client_name: "Confidential", accepts_external_referrals: false });
    expect(() => sql(`select set_config('app.job_terms_rpc', 'on', true); update public.jobs set accepts_external_referrals = true where id = '${keyless}'`))
      .toThrow(/client_name_required_for_referrals/);
  });

  it("an open job whose name becomes a placeholder is hidden from partners with no_client_name; in-flight referrals carry on (AC-2, AC-3)", async () => {
    const { job, referralId } = await referred();
    const visible = () => one(`select app.job_partner_visible(j) from public.jobs j where j.id = '${job}'`);
    expect(visible()).toBe("t");
    replica(`update public.jobs set client_name = 'Confidential' where id = '${job}'`);
    const { data: state } = await b.client.rpc("get_jobs_terms_state", { p_org: orgB.id, p_job: job });
    expect(state?.[0]).toMatchObject({ partner_visible: false, hidden_reason: "no_client_name" });
    expect(visible()).toBe("f");
    // Both submit RPCs refuse it like any hidden job.
    const cand2 = await createCandidate(a, orgA.id, { email: `n3-${uniq()}@example.com` });
    const consent = await sharingConsent(a, orgA.id, cand2, job);
    const sub = await a.client.rpc("submit_referral", { p_candidate: cand2, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline"], p_document_ids: [],
      p_consent: consent, p_idempotency_key: randomUUID() }).single();
    expect(sub.error?.message).toMatch(/job_not_open_for_referrals/);
    // The in-flight referral keeps moving.
    await move(referralId, "under_review");
    await move(referralId, "accepted");
    // A real name again: visible.
    replica(`update public.jobs set client_name = 'Globex Corp' where id = '${job}'`);
    expect(visible()).toBe("t");
  });

  it("the TS client-key mirror matches app.client_key()", () => {
    const names = ["Acme Inc.", "  ACME  ", "Société Générale S.A.", "Confidential", "client confidentiel", "N/A", "TBD", "Stealth startup",
      "Brook & Street Ltd", "O'Reilly Co", "Ålborg Ltée", "Müller GmbH", "Groß", "œuvre", "Corp", "Inc", "", "Undisclosed Client"];
    for (const n of names) {
      const sqlKey = one(`select coalesce(app.client_key(${n === "" ? "''" : `$q$${n}$q$`}), '<null>')`);
      expect(clientKey(n) ?? "<null>", n).toBe(sqlKey);
    }
  });
});

describe("BR-2 server-only delivery recording", () => {
  it("members can't execute record_candidate_request_delivery; the service-role path takes the actor (AC-5)", async () => {
    const job = await createJob(b, orgB.id, { title: `Deliv ${uniq()}`, client_name: `Client ${uniq()}` });
    const cand = await createCandidate(a, orgA.id, { email: `n3d-${uniq()}@example.com` });
    const { data: sub, error } = await a.client.rpc("submit_referral_for_candidate", {
      p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline"], p_document_ids: [], p_note: null,
      p_idempotency_key: randomUUID(),
    } as never).single();
    if (error) throw new Error(error.message);
    const referralId = (sub as { referral_id: string }).referral_id;
    const sent = () => one(`select coalesce(sent_at::text, '-') || '|' || send_count from public.referral_candidate_requests where referral_id = '${referralId}'`);
    const before = sent();
    for (const args of [{ p_referral: referralId, p_ok: true }, { p_referral: referralId, p_actor: a.id, p_ok: true }]) {
      const r = await a.client.rpc("record_candidate_request_delivery", args as never);
      expect(r.error, JSON.stringify(args)).not.toBeNull();
    }
    expect(sent()).toBe(before);
    // Service role: an actor outside the source org is refused; the real actor records "sent".
    const bad = await admin().rpc("record_candidate_request_delivery", { p_referral: referralId, p_actor: c.id, p_ok: true });
    expect(bad.error?.message).toMatch(/^forbidden/);
    const ok = await admin().rpc("record_candidate_request_delivery", { p_referral: referralId, p_actor: a.id, p_ok: true });
    expect(ok.error).toBeNull();
    expect(sent()).toMatch(/\|1$/);
    expect(one(`select has_function_privilege('authenticated', 'public.record_candidate_request_delivery(uuid, uuid, boolean, text)', 'execute')`)).toBe("f");
    expect(one(`select count(*) from pg_proc where proname = 'record_candidate_request_delivery'`)).toBe("1");
  });
});

// ---------------------------------------------------------------------------------------------
describe("BR-4 / BR-7 hire eligibility and who can record", () => {
  it("records from withdrawn, rejected, cancelled, accepted and interviewing; the timeline keeps the prior status (AC-15)", async () => {
    for (const path of [["accepted", "interviewing", "rejected"], ["accepted", "cancelled"], ["accepted"], ["accepted", "interviewing"], ["accepted", "withdrawn:a"]]) {
      const { referralId } = await referred();
      await move(referralId, "accepted");
      await confirm(referralId);
      for (const step of path.slice(1)) {
        const [to, who] = step.split(":");
        await move(referralId, to, who === "a" ? a : b);
      }
      const prior = (await referral(referralId)).status;
      const res = await hire(referralId);
      expect(res.error, `${prior}`).toBeNull();
      expect(res.data).toBeTruthy();
      const r = await referral(referralId);
      expect(r.status).toBe("hired");
      expect(hireRecord(referralId)).toBe(`placement|${res.data}|${prior}|-`);
      expect(one(`select from_status || '>' || to_status from public.referral_status_events where referral_id = '${referralId}' order by id desc limit 1`)).toBe(`${prior}>hired`);
      expect(one(`select metadata->>'prior_status' from public.audit_events where entity_id = '${referralId}' and action = 'referral.hire_recorded' and organization_id = '${orgB.id}'`)).toBe(prior);
    }
  });

  it("a declined referral (never accepted) records with the deemed agreement when the flag is on (AC-15, AC-20)", async () => {
    flag(true);
    const { referralId } = await referred();
    await move(referralId, "declined");
    const res = await hire(referralId);
    expect(res.error).toBeNull();
    expect(hireRecord(referralId)).toBe(`placement|${res.data}|declined|-`);
  });

  it("the happy path (offer + active agreement) is unchanged: a placement, as in N2 (AC-13)", async () => {
    const { referralId } = await referred();
    await withAgreement(referralId);
    await move(referralId, "interviewing");
    await move(referralId, "offer");
    const res = await hire(referralId);
    expect(res.error).toBeNull();
    const p = (await admin().from("placements").select("*").eq("id", res.data as string).single()).data!;
    expect(p).toMatchObject({ status: "hire_reported", contracted_fee_minor: 2_000_000, computed_fee_minor: 2_000_000, currency: "CAD" });
    expect(p.invoice_due_at).toBe(one(`select to_char(app.add_business_days(app.date_et('${today()}'::date), 10) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS+00:00')`));
  });

  it("refuses ineligible referrals with hire_not_eligible and writes nothing (AC-6, AC-8, AC-92)", async () => {
    const cases: [string, (id: string) => Promise<void> | void][] = [
      ["no delivered_at", (id) => { replica(`update public.referrals set delivered_at = null where id = '${id}'`); }],
      ["already_presented", (id) => { replica(`update public.referrals set status = 'already_presented' where id = '${id}'`); }],
      ["upheld objection", (id) => { objection(id, "upheld"); }],
      ["final objection", (id) => { objection(id, "open", -1); }],
      ["void", (id) => { replica(`update app.referral_presentations set void_reason = 'authorization_void', voided_at = now() where referral_id = '${id}'`); }],
      ["closed past window + 9 months", async (id) => {
        await move(id, "accepted");
        await confirm(id);
        await move(id, "cancelled");
        replica(`update public.referrals set delivered_at = now() - interval '16 months', ownership_protected_until = now() - interval '10 months' where id = '${id}'`);
      }],
    ];
    for (const [label, setup] of cases) {
      const { referralId } = await referred();
      await setup(referralId);
      const before = (await referral(referralId)).status;
      const res = await hire(referralId);
      // already_presented is hidden from the hiring side altogether (N1), so it answers not_found.
      expect(res.error?.message, label).toMatch(label === "already_presented" ? /^not_found/ : /^hire_not_eligible/);
      expect((await referral(referralId)).status, label).toBe(before);
      expect(hireRecord(referralId), label).toBeUndefined();
      // Other suites check global invariants on every referral (delivered ⇔ ownership date): undo the fixture.
      if (label === "no delivered_at") replica(`update public.referrals set delivered_at = submitted_at where id = '${referralId}'`);
    }
    // One hire record per referral.
    const { referralId } = await referred();
    await withAgreement(referralId);
    expect((await hire(referralId)).error).toBeNull();
    sql(`update public.referrals set status = 'interviewing' where id = '${referralId}'`); // even if the status were moved back
    expect((await hire(referralId)).error?.message).toMatch(/^hire_not_eligible/);
  });

  it("closed referrals stay eligible until window end + 9 months; legacy referrals use delivery + 12 + 9 (AC-7, AC-11)", async () => {
    const { referralId } = await referred();
    await withAgreement(referralId);
    await move(referralId, "cancelled");
    // Window ended 4 months ago: coverage is the admin's call, never the server's.
    replica(`update public.referrals set delivered_at = now() - interval '10 months', ownership_protected_until = now() - interval '4 months' where id = '${referralId}'`);
    expect(one(`select app.hire_eligibility('${referralId}')`)).toBe("eligible");
    replica(`update public.referrals set terms_version_id = null, commission_rule_id = null, fee_estimate_minor = null, delivered_at = now() - interval '20 months' where id = '${referralId}'`);
    expect(one(`select app.hire_eligibility('${referralId}')`)).toBe("eligible");
    replica(`update public.referrals set delivered_at = now() - interval '22 months' where id = '${referralId}'`);
    expect(one(`select app.hire_eligibility('${referralId}')`)).toBe("not_eligible");
    // In progress never expires.
    replica(`update public.referrals set status = 'interviewing' where id = '${referralId}'`);
    expect(one(`select app.hire_eligibility('${referralId}')`)).toBe("eligible");
  });

  it("only the job owner and B's managers can record; B recruiters, A, C and anon get not_found (AC-14, AC-96)", async () => {
    const { referralId } = await referred();
    await withAgreement(referralId);
    for (const u of [bRec, a, c]) {
      const res = await hire(referralId, {}, u);
      expect(res.error?.message, u.email).toMatch(/^not_found/);
    }
    const anonRes = await anon().rpc("report_hire", { p_referral: referralId, p_start_date: today(), p_expected_version: 1 } as never);
    expect(anonRes.error).not.toBeNull();
    const unknown = await b.client.rpc("report_hire", { p_referral: randomUUID(), p_start_date: today(), p_expected_version: 1 } as never);
    expect(unknown.error?.message).toMatch(/^not_found/);
    const mgr = await hire(referralId, {}, bMgr);
    expect(mgr.error).toBeNull();
  });
});

describe("BR-3 / BR-8 common fields", () => {
  it("another role at this client: stored with the snapshot rate × the role's base and the minimum fee (AC-17)", async () => {
    const { referralId } = await referred({}, { p_min_fee_minor: 2_500_000 });
    await withAgreement(referralId);
    const res = await hire(referralId, { p_hired_role_title: "  Senior Analyst ", p_offer_accepted_on: daysAgo(2) });
    expect(res.error).toBeNull();
    expect(one(`select contracted_fee_minor from public.placements where id = '${res.data}'`)).toBe("2500000");
    expect(hireRecord(referralId)).toMatch(/\|Senior Analyst$/);
    // Both sides read the role on the hire record.
    for (const u of [a, b]) expect((await u.client.from("hire_records").select("hired_role_title").eq("referral_id", referralId).single()).data?.hired_role_title).toBe("Senior Analyst");
  });

  it("another role is refused when the referral carries no client key; titles over 120 chars are refused (AC-9)", async () => {
    const { referralId } = await referred();
    await withAgreement(referralId);
    expect((await hire(referralId, { p_hired_role_title: "x".repeat(121) })).error?.message).toMatch(/^hire_not_eligible/);
    sql(`update app.referral_commit_keys set client_key = null where referral_id = '${referralId}'; update app.referral_presentations set client_key = null where referral_id = '${referralId}'`);
    expect((await hire(referralId, { p_hired_role_title: "Analyst" })).error?.message).toMatch(/^hire_not_eligible/);
    expect((await hire(referralId)).error).toBeNull(); // "This job" still works
  });

  it("dates: acceptance after the start or in the future, and out-of-range starts, are refused (AC-16)", async () => {
    const { referralId } = await referred();
    await withAgreement(referralId);
    const tomorrow = one(`select ((now() at time zone 'America/Toronto')::date + 1)::text`);
    for (const args of [
      { p_offer_accepted_on: tomorrow, p_start_date: one(`select ((now() at time zone 'America/Toronto')::date + 30)::text`) },
      { p_offer_accepted_on: daysAgo(1), p_start_date: daysAgo(5) },
      { p_start_date: one(`select ((now() at time zone 'America/Toronto')::date + 600)::text`) },
      { p_start_date: null },
    ]) expect((await hire(referralId, args)).error?.message, JSON.stringify(args)).toMatch(/^hire_dates_invalid/);
    // A future start (notice period) with an unknown acceptance date is fine.
    const res = await hire(referralId, { p_start_date: one(`select ((now() at time zone 'America/Toronto')::date + 45)::text`) });
    expect(res.error).toBeNull();
    expect(one(`select coalesce(offer_accepted_on::text, 'unknown') from public.hire_records where referral_id = '${referralId}'`)).toBe("unknown");
  });

  it("BR-15 non_permanent_engagement is a valid I ≠ C reason; amendments meanwhile give hire_terms_changed (AC-18, AC-31)", async () => {
    const { referralId } = await referred();
    await withAgreement(referralId);
    const stale = await hire(referralId, { p_terms_version: randomUUID() });
    expect(stale.error?.message).toMatch(/^hire_terms_changed/);
    const res = await hire(referralId, { p_invoiced_fee_minor: 1_500_000, p_difference_reason: "non_permanent_engagement" });
    expect(res.error).toBeNull();
    expect(one(`select fee_difference_reason from public.placements where id = '${res.data}'`)).toBe("non_permanent_engagement");
  });
});

// ---------------------------------------------------------------------------------------------
describe("BR-9 / BR-11 deemed agreement, records without a split, released referrals", () => {
  it("flag on, never accepted: an agreement deemed from the snapshot, a placement, A notified (AC-20)", async () => {
    flag(true);
    const { referralId } = await referred();
    const since = dbNow();
    const res = await hire(referralId);
    expect(res.error).toBeNull();
    const ag = (await admin().from("collaboration_agreements").select("*").eq("referral_id", referralId).single()).data!;
    const r = await referral(referralId);
    expect(ag).toMatchObject({ status: "active", origin: "deemed", rule_id: r.commission_rule_id, terms_version_id: r.terms_version_id, source_accepted_at: null });
    expect(ag.deemed_at).not.toBeNull();
    expect(notes(a.id, "hire.recorded_deemed_agreement", since)).toHaveLength(1);
    expect(hireRecord(referralId)).toMatch(/^placement\|/);
  });

  it("flag on, accepted but never confirmed: the pending agreement becomes active as deemed (AC-21)", async () => {
    flag(true);
    const { referralId } = await referred();
    await move(referralId, "accepted");
    const pending = (await admin().from("collaboration_agreements").select("id, status").eq("referral_id", referralId).single()).data!;
    expect(pending.status).toBe("pending_source");
    expect((await hire(referralId)).error).toBeNull();
    const rows = (await admin().from("collaboration_agreements").select("id, status, origin").eq("referral_id", referralId)).data!;
    expect(rows).toEqual([{ id: pending.id, status: "active", origin: "deemed" }]);
  });

  it("flag off, no confirmed agreement: a hire recorded without a split, no placement, referral hired, A notified (AC-23)", async () => {
    const { referralId } = await referred();
    const since = dbNow();
    const res = await hire(referralId, { p_base_minor: undefined, p_terms_version: undefined });
    expect(res.error).toBeNull();
    expect(res.data).toBeNull();
    expect(hireRecord(referralId)).toBe("record_only_no_agreement|-|submitted|-");
    expect((await referral(referralId)).status).toBe("hired");
    expect(one(`select count(*) from public.placements where referral_id = '${referralId}'`)).toBe("0");
    expect(one(`select count(*) from public.collaboration_agreements where referral_id = '${referralId}'`)).toBe("0");
    expect(notes(a.id, "hire.recorded_without_split", since)).toHaveLength(1);
    const { data: st } = await a.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgA.id });
    expect(st).toMatchObject({ side: "source", hire_record: { kind: "no_split", no_split_reason: "no_agreement" } });
  });

  it("the flag isn't writable by members or the app session; a service-role change is audited; false by default (AC-24)", async () => {
    expect(one(`select value::text from app.platform_settings where key = 'deemed_agreement_enabled'`)).toBe("false");
    for (const u of [a, b, platform]) {
      const r = await u.client.schema("app" as never).from("platform_settings").update({ value: true } as never).eq("key", "deemed_agreement_enabled");
      expect(r.error, u.email).not.toBeNull();
    }
    expect(one(`select value::text from app.platform_settings where key = 'deemed_agreement_enabled'`)).toBe("false");
    const since = dbNow();
    flag(true);
    expect(one(`select count(*) from public.audit_events where action = 'platform.setting_changed' and created_at >= '${since}' and metadata->>'to' = 'true'`)).toBe("1");
  });

  it("flag on, internal referral: the deemed agreement keeps 0 sourcing bps (AC-22, HE-14)", async () => {
    flag(true);
    // A shares a member with B → referrals between them are internal.
    const shared = await createUser("n3-shared");
    const orgI = await createOrg(shared, "N3 Related I");
    await admin().from("organization_memberships").insert({ organization_id: orgI.id, user_id: b.id, role: "recruiter", status: "active" });
    const job = await createJob(b, orgB.id, { title: `Int ${uniq()}`, client_name: `Client ${uniq()}` });
    const cand = await createCandidate(shared, orgI.id, { email: `n3i-${uniq()}@example.com` });
    const consent = await sharingConsent(shared, orgI.id, cand, job);
    const { data } = await shared.client.rpc("submit_referral", { p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline"],
      p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID() }).single();
    const referralId = data!.referral_id!;
    expect((await referral(referralId)).internal).toBe(true);
    expect((await hire(referralId)).error).toBeNull();
    expect(one(`select sourcing_bps || '/' || origin from public.collaboration_agreements where referral_id = '${referralId}'`)).toBe("0/deemed");
  });

  it("released referral: same variant as unreleased before the record; then recorded without a split, money discarded (AC-26, AC-27)", async () => {
    const r1 = await referred();
    const r2 = await referred();
    for (const { referralId } of [r1, r2]) {
      await withAgreement(referralId);
      await move(referralId, "interviewing");
      await move(referralId, "rejected");
    }
    const rel = await a.client.rpc("release_referral", { p_referral: r1.referralId, p_acting_org: orgA.id });
    expect(rel.error).toBeNull();
    // Everything B can read about the hire is identical apart from ids.
    // Ids, the job title and per-referral timestamps (delivery, window, claim deadline) naturally differ.
    const TS = ["delivered_at", "protected_until", "ownership_protected_until", "claim_deadline_at", "review_clock_started_at", "claim_prior_date_min", "job_title"];
    const strip = (x: unknown) => JSON.stringify(x, (k, v) => (TS.includes(k) ? null : v)).replaceAll(r1.referralId, "ID").replaceAll(r2.referralId, "ID");
    const [s1, s2] = await Promise.all([r1, r2].map(async ({ referralId }) => (await b.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgB.id })).data));
    expect(strip(s1)).toBe(strip(s2));
    expect(s1).toMatchObject({ variant: "confirmed", can_record: true, ownership: "protected" });
    const [p1, p2] = await Promise.all([r1, r2].map(async ({ referralId }) => (await b.client.rpc("get_referral_presentation", { p_referral: referralId, p_acting_org: orgB.id })).data));
    expect(strip(p1)).toBe(strip(p2));
    // Invalid money is refused on the released referral exactly like on the other one (no oracle before the record).
    expect((await hire(r1.referralId, { p_base_minor: -5 })).error?.message).toMatch(/^hire_base_invalid/);
    const since = dbNow();
    const res = await hire(r1.referralId, { p_hired_role_title: "Analyst" });
    expect(res.error).toBeNull();
    expect(res.data).toBeNull();
    expect(hireRecord(r1.referralId)).toBe("record_only_released|-|rejected|Analyst");
    expect(one(`select count(*) from public.placements where referral_id = '${r1.referralId}'`)).toBe("0");
    expect(notes(a.id, "hire.recorded_without_split", since)).toHaveLength(1);
    const { data: after } = await b.client.rpc("get_referral_hire_state", { p_referral: r1.referralId, p_acting_org: orgB.id });
    expect(after).toMatchObject({ hire_record: { kind: "no_split", no_split_reason: "released" } });
  });
});

describe("BR-13 late marker and BR-45 own objection", () => {
  it("late = more than 5 business days after start (or stated acceptance); admin-only (AC-29)", async () => {
    const r1 = await referred();
    await withAgreement(r1.referralId);
    expect((await hire(r1.referralId, { p_start_date: daysAgo(20) })).error).toBeNull();
    expect(late(r1.referralId)).toBe("t");
    const r2 = await referred();
    await withAgreement(r2.referralId);
    expect((await hire(r2.referralId, { p_start_date: today(), p_offer_accepted_on: daysAgo(20) })).error).toBeNull();
    expect(late(r2.referralId)).toBe("t");
    const r3 = await referred();
    await withAgreement(r3.referralId);
    expect((await hire(r3.referralId, { p_start_date: today(), p_offer_accepted_on: daysAgo(1) })).error).toBeNull();
    expect(late(r3.referralId)).toBe("f");
    // Never in an org payload: not in hire_records, not in org audit metadata, not readable in app.*.
    for (const u of [a, b]) {
      const { data } = await u.client.from("hire_records").select("*").eq("referral_id", r1.referralId).single();
      expect(Object.keys(data ?? {})).not.toContain("late");
      const adminRead = await u.client.rpc("admin_get_hire_record", { p_referral: r1.referralId });
      expect(adminRead.error?.message).toMatch(/^not_found/);
    }
    expect(one(`select count(*) from public.audit_events where entity_id = '${r1.referralId}' and organization_id is not null and metadata ? 'late'`)).toBe("0");
    const { data: rec } = await platform.client.rpc("admin_get_hire_record", { p_referral: r1.referralId });
    expect(rec).toMatchObject({ late: true, kind: "placement" });
  });

  it("refused with objection_open while B's own objection is open or contested; after a rejection a record within 5 business days isn't late (AC-102)", async () => {
    for (const status of ["open", "contested"] as const) {
      const { referralId } = await referred();
      await withAgreement(referralId);
      objection(referralId, status);
      const res = await hire(referralId);
      expect(res.error?.message, status).toMatch(/^objection_open/);
      expect(hireRecord(referralId)).toBeUndefined();
      const { data: st } = await b.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgB.id });
      expect(st, status).toMatchObject({ variant: "objection_open", can_record: true });
    }
    const { referralId } = await referred();
    await withAgreement(referralId);
    objection(referralId, "rejected");
    replica(`update public.referrals set claim_rejected_at = now() - interval '1 day' where id = '${referralId}'`);
    expect((await hire(referralId, { p_start_date: daysAgo(30) })).error).toBeNull();
    expect(late(referralId)).toBe("f");
  });
});

// ---------------------------------------------------------------------------------------------
describe("BR-31 / BR-32 fee-pending placements", () => {
  /** An upheld report's placement (drop 2 calls app.establish_hire from the decision). */
  async function feePending(legacy = false) {
    const { referralId } = await referred();
    await withAgreement(referralId);
    if (legacy) replica(`update public.referrals set terms_version_id = null, commission_rule_id = null, fee_estimate_minor = null where id = '${referralId}'`);
    const id = one(`select app.establish_hire('${referralId}', 'upheld')`);
    return { referralId, placementId: id };
  }

  it("established without fee details; no invoice, evidence or allocation until B enters them (AC-68, AC-69)", async () => {
    const { referralId, placementId } = await feePending();
    const p = (await admin().from("placements").select("*").eq("id", placementId).single()).data!;
    expect(p).toMatchObject({ status: "fee_pending", contracted_fee_minor: null, start_date: null, currency: "CAD", established_how: "upheld" });
    expect(one(`select fee_details_due_at = app.add_business_days(established_at, 10) from public.placements where id = '${placementId}'`)).toBe("t");
    expect(hireRecord(referralId)).toMatch(/^placement\|/);
    expect(late(referralId)).toBe("f");
    const inv = await b.client.rpc("record_invoice", { p_placement: placementId, p_number: "INV-1", p_amount_minor: 100, p_tax_minor: 0, p_issued_on: today(), p_due_on: today() });
    expect(inv.error?.message).toMatch(/^placement_fee_pending/);
    for (const kind of ["client_payment", "sourcing_payout"] as const) {
      const ev = await b.client.rpc("record_payment_evidence", { p_placement: placementId, p_kind: kind, p_amount_minor: 100, p_processing_fee_minor: 0, p_occurred_on: today(),
        p_reference: "wire", p_notes: "", p_idempotency_key: randomUUID() });
      expect(ev.error?.message, kind).toMatch(/^placement_fee_pending/);
    }
    const direct = await admin().from("invoice_records").insert({ placement_id: placementId, invoice_number: "X", amount_minor: 1, tax_minor: 0, currency: "CAD", issued_on: today(), recorded_by: b.id } as never);
    expect(direct.error?.message).toMatch(/placement_fee_pending/);
    // A dispute stays available (BR-33).
    const disp = await a.client.rpc("open_dispute", { p_placement: placementId, p_reason: "We disagree on the start date." });
    expect(disp.error).toBeNull();
  });

  it("B enters the fee details: a normal N2 placement with the invoice clock; A and others can't (AC-70, AC-72)", async () => {
    const { referralId, placementId } = await feePending();
    const args = (over: Record<string, unknown> = {}) => ({ p_placement: placementId, p_expected_version: Number(one(`select version from public.placements where id = '${placementId}'`)),
      p_start_date: daysAgo(3), p_terms_version: effectiveTerms(referralId), p_base_minor: BASE, ...over });
    for (const u of [a, bRec, c]) expect((await u.client.rpc("complete_fee_details", args() as never)).error?.message, u.email).toMatch(/^not_found/);
    for (const over of [{ p_base_minor: 1_000_000_000_001 }, { p_base_minor: -1 }, { p_invoiced_fee_minor: 2_000_000_000_000_000, p_difference_reason: "other", p_difference_note: "x" }]) {
      expect((await b.client.rpc("complete_fee_details", args(over) as never)).error?.message, JSON.stringify(over)).toMatch(/^hire_base_invalid/);
    }
    expect((await b.client.rpc("complete_fee_details", args({ p_terms_version: randomUUID() }) as never)).error?.message).toMatch(/^hire_terms_changed/);
    const ok = await b.client.rpc("complete_fee_details", args() as never);
    expect(ok.error).toBeNull();
    const p = (await admin().from("placements").select("*").eq("id", placementId).single()).data!;
    expect(p).toMatchObject({ status: "hire_reported", contracted_fee_minor: 2_000_000, computed_fee_minor: 2_000_000, reported_by: b.id });
    expect(p.invoice_due_at).not.toBeNull();
    expect((await b.client.rpc("complete_fee_details", args() as never)).error?.message).toMatch(/^placement_locked/);
    // Now invoices work as in N2.
    const inv = await b.client.rpc("record_invoice", { p_placement: placementId, p_number: `INV-${uniq()}`, p_amount_minor: 2_000_000, p_tax_minor: 0, p_issued_on: today(), p_due_on: today() });
    expect(inv.error).toBeNull();
  });

  it("a legacy fee-pending placement takes legacy free entry (currency and fee) (AC-68)", async () => {
    const { placementId } = await feePending(true);
    expect(one(`select coalesce(currency, '-') from public.placements where id = '${placementId}'`)).toBe("-");
    const res = await b.client.rpc("complete_fee_details", { p_placement: placementId, p_expected_version: 1, p_start_date: daysAgo(2),
      p_legacy_fee_minor: 1_800_000, p_legacy_currency: "USD", p_legacy_guarantee_days: 60 });
    expect(res.error).toBeNull();
    expect(one(`select currency || ':' || contracted_fee_minor from public.placements where id = '${placementId}'`)).toBe("USD:1800000");
  });

  it("with the flag off and no confirmed agreement, an established hire is recorded without a split (AC-25)", async () => {
    const { referralId } = await referred();
    expect(one(`select coalesce(app.establish_hire('${referralId}', 'upheld')::text, 'null')`)).toBe("null");
    expect(hireRecord(referralId)).toBe("record_only_no_agreement|-|submitted|-");
    flag(true);
    const r2 = await referred();
    const id = one(`select app.establish_hire('${r2.referralId}', 'deemed')`);
    expect(one(`select status || '/' || established_how from public.placements where id = '${id}'`)).toBe("fee_pending/deemed");
    expect(one(`select origin from public.collaboration_agreements where referral_id = '${r2.referralId}'`)).toBe("deemed");
  });

  it("overdue fee details: B notified once by the sweep; admin task and notice sent (AC-71)", async () => {
    const { referralId, placementId } = await feePending();
    replica(`update public.placements set fee_details_due_at = now() - interval '1 hour' where id = '${placementId}'`);
    const since = dbNow();
    const run1 = await admin().rpc("run_hire_maintenance");
    expect(run1.error).toBeNull();
    await admin().rpc("run_hire_maintenance");
    expect(notes(b.id, "fee_details.overdue", since)).toHaveLength(1);
    expect(notes(a.id, "fee_details.overdue", since)).toHaveLength(0);
    const { data: tasks } = await platform.client.rpc("admin_list_hire_tasks");
    expect((tasks ?? []).find((t) => t.placement_id === placementId)).toMatchObject({ task: "fee_overdue", referral_id: referralId, notice_sent_on: null });
    expect((await b.client.rpc("admin_list_hire_tasks")).error?.message).toMatch(/^not_found/);
    expect((await b.client.rpc("run_hire_maintenance")).error).not.toBeNull();
    const notice = await platform.client.rpc("admin_record_fee_notice", { p_placement: placementId, p_sent_on: today(), p_note: "Emailed both admins" });
    expect(notice.error).toBeNull();
    const after = (await platform.client.rpc("admin_list_hire_tasks")).data!.find((t) => t.placement_id === placementId);
    expect(after).toMatchObject({ task: "fee_overdue", notice_sent_on: today() });
    expect(one(`select status from public.placements where id = '${placementId}'`)).toBe("fee_pending"); // nothing paused or changed
  });
});

// ---------------------------------------------------------------------------------------------
describe("BR-34 release from declined / rejected; BR-35 ownership line; BR-12 admin note", () => {
  it("A can release a declined or rejected referral that still counts; not once a hire is recorded (AC-74, AC-75)", async () => {
    for (const to of ["declined", "rejected"]) {
      const { referralId } = await referred();
      if (to === "rejected") {
        await withAgreement(referralId);
        await move(referralId, "interviewing");
      }
      await move(referralId, to);
      const { data: pres } = await a.client.rpc("get_referral_presentation", { p_referral: referralId, p_acting_org: orgA.id });
      expect((pres as { can_release: boolean }).can_release, to).toBe(true);
      expect((await a.client.rpc("release_referral", { p_referral: referralId, p_acting_org: orgA.id })).error).toBeNull();
    }
    const { referralId } = await referred();
    await withAgreement(referralId);
    await move(referralId, "interviewing");
    await move(referralId, "rejected");
    expect((await hire(referralId)).error).toBeNull();
    sql(`set session_replication_role = replica; update public.referrals set status = 'rejected' where id = '${referralId}'`);
    expect((await a.client.rpc("release_referral", { p_referral: referralId, p_acting_org: orgA.id })).error?.message).toMatch(/^release_not_allowed/);
    // B can't release.
    const other = await referred();
    await move(other.referralId, "declined");
    expect((await b.client.rpc("release_referral", { p_referral: other.referralId, p_acting_org: orgB.id })).error?.message).toMatch(/^not_found/);
  });

  it("ownership line: protected while delivered and inside the window or in progress; closed after; not delivered without a date (AC-76, AC-77)", async () => {
    const { referralId } = await referred();
    for (const [u, org] of [[a, orgA], [b, orgB]] as const) {
      const { data } = await u.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: org.id });
      expect(data).toMatchObject({ ownership: "protected" });
      expect((data as { protected_until: string }).protected_until).toBe((await referral(referralId)).ownership_protected_until);
    }
    await move(referralId, "declined");
    replica(`update public.referrals set ownership_protected_until = now() - interval '1 day' where id = '${referralId}'`);
    for (const [u, org] of [[a, orgA], [b, orgB]] as const) {
      const { data } = await u.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: org.id });
      expect(data).toMatchObject({ ownership: "closed" });
    }
    const { data: src } = await a.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgA.id });
    expect(src).toHaveProperty("report_until");
    const { data: tgt } = await b.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgB.id });
    expect(tgt).not.toHaveProperty("report_until");
    expect(tgt).not.toHaveProperty("released_at");
    // Other orgs, B recruiters and unknown ids: not found.
    for (const u of [c, bRec]) expect((await u.client.rpc("get_referral_hire_state", { p_referral: referralId })).error?.message).toMatch(/^not_found/);
    expect((await b.client.rpc("get_referral_hire_state", { p_referral: randomUUID() })).error?.message).toMatch(/^not_found/);
  });

  it("admin note on a hire record: platform admin only, audited without the text, never in an org payload (AC-28)", async () => {
    const { referralId } = await referred();
    await withAgreement(referralId);
    // A forged related-org argument doesn't exist on the RPC.
    const forged = await hire(referralId, { p_related_org_hire: true });
    expect(forged.error).not.toBeNull();
    expect((await hire(referralId)).error).toBeNull();
    for (const u of [a, b]) expect((await u.client.rpc("admin_set_hire_record_note", { p_referral: referralId, p_note: "x" })).error?.message).toMatch(/^not_found/);
    const note = "Hired by a related organization of B (shared member).";
    expect((await platform.client.rpc("admin_set_hire_record_note", { p_referral: referralId, p_note: note })).error).toBeNull();
    expect((await platform.client.rpc("admin_get_hire_record", { p_referral: referralId })).data).toMatchObject({ admin_note: note });
    expect(one(`select count(*) from public.audit_events where entity_id = '${referralId}' and action = 'hire_record.note_saved' and organization_id is null`)).toBe("1");
    expect(one(`select count(*) from public.audit_events where metadata::text like '%related organization%'`)).toBe("0");
    expect((await platform.client.rpc("admin_set_hire_record_note", { p_referral: referralId, p_note: "x".repeat(2001) })).error?.message).toMatch(/^note_too_long/);
    expect((await platform.client.rpc("admin_set_hire_record_note", { p_referral: randomUUID(), p_note: "x" })).error?.message).toMatch(/^not_found/);
  });
});

describe("BR-36 HA-9 Ops SQL (AC-78, AC-10)", () => {
  /** The documented query, executed verbatim from docs/ops/n3-hire-signals.sql. */
  const ha9 = () => {
    const file = readFileSync(path.resolve(import.meta.dirname, "../../docs/ops/n3-hire-signals.sql"), "utf8");
    const body = file.split("-- name: ha9_release_before_hire")[1].split("\n\n")[0].split("\n").slice(1).join("\n").replace(/;\s*$/, "");
    return sql(`select released_referral_id || '>' || hired_referral_id from (${body}) q`);
  };

  it("returns a release followed by a hire record at the same client within 14 days (either key), not on day 15, never across hiring orgs", async () => {
    // R1 released by A; a hire is then recorded on R2 at the same hiring org whose keys overlap R1's.
    const r1 = await referred();
    await move(r1.referralId, "declined");
    expect((await a.client.rpc("release_referral", { p_referral: r1.referralId, p_acting_org: orgA.id })).error).toBeNull();
    const r2 = await referred();
    await withAgreement(r2.referralId);
    // Same client by the delivery key only (union rule, AC-10).
    sql(`update app.referral_presentations set client_key = (select client_key from app.referral_commit_keys where referral_id = '${r1.referralId}') where referral_id = '${r2.referralId}';
         update app.referral_commit_keys set client_key = 'some other client' where referral_id = '${r2.referralId}'`);
    expect((await hire(r2.referralId)).error).toBeNull();
    expect(ha9()).toContain(`${r1.referralId}>${r2.referralId}`);
    // Day D + 15: not returned.
    sql(`update app.referral_presentations set released_at = released_at - interval '15 days' where referral_id = '${r1.referralId}'`);
    expect(ha9()).not.toContain(`${r1.referralId}>${r2.referralId}`);
    // Day D + 14: returned again.
    sql(`update app.referral_presentations set released_at = released_at + interval '1 day' where referral_id = '${r1.referralId}'`);
    expect(ha9()).toContain(`${r1.referralId}>${r2.referralId}`);
    // A hire at another hiring org on the same key is never paired.
    const other = await createUser("n3-b2");
    const orgB2 = await createOrg(other, "N3 Hiring B2");
    const job = await createJob(other, orgB2.id, { title: `B2 ${uniq()}`, client_name: `Client ${uniq()}` });
    const cand = await createCandidate(a, orgA.id, { email: `n3b2-${uniq()}@example.com` });
    const consent = await sharingConsent(a, orgA.id, cand, job);
    const { data } = await a.client.rpc("submit_referral", { p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline"],
      p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID() }).single();
    const r3 = data!.referral_id!;
    sql(`update app.referral_presentations set client_key = (select client_key from app.referral_commit_keys where referral_id = '${r1.referralId}') where referral_id = '${r3}'`);
    const h3 = await other.client.rpc("report_hire", { p_referral: r3, p_start_date: today(), p_expected_version: (await referral(r3)).version } as never);
    expect(h3.error).toBeNull(); // flag off, never accepted → recorded without a split
    expect(ha9().some((x) => x.endsWith(`>${r3}`))).toBe(false);
  });
});
