import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { admin, createCandidate, createJob, createOrg, createUser, dbNow, effectiveTerms, publishTerms, sharingConsent, sql, termsOf, type TestUser } from "./helpers";

/**
 * N3 drop 2 (docs/specs/referral-claims-two-sided-hire, backend.md v2): hire reports (BR-6, BR-17 to BR-22), the
 * hiring side's answer (BR-23 to BR-29), the admin decision and tools (BR-27, BR-28), the RD-029 authorization check
 * (BR-37, BR-38), HA-6 (BR-40), the generalized evidence pipeline, and the PD-077 conditions.
 */

let a: TestUser, a2: TestUser, b: TestUser, bMgr: TestUser, c: TestUser, platform: TestUser;
let orgA: { id: string }, orgB: { id: string }, orgC: { id: string };
const uniq = () => randomUUID().slice(0, 8);
const one = (q: string) => sql(q)[0];
const referral = async (id: string) => (await admin().from("referrals").select("*").eq("id", id).single()).data!;
const replica = (q: string) => sql(`set session_replication_role = replica; ${q}`);
const today = () => one(`select (now() at time zone 'America/Toronto')::date::text`);
const daysAgo = (n: number) => one(`select ((now() at time zone 'America/Toronto')::date - ${n})::text`);
const month = () => one(`select to_char(now() at time zone 'America/Toronto', 'YYYY-MM-01')`);
const notes = (userId: string, kind: string, since: string) =>
  sql(`select body from public.notifications where user_id = '${userId}' and kind = '${kind}' and created_at >= '${since}'`);
const report = (id: string) => sql(`select status from app.hire_reports where id = '${id}'`)[0];
const flag = (on: boolean) => sql(`update app.platform_settings set value = '${on}'::jsonb where key = 'deemed_agreement_enabled'`);

beforeAll(async () => {
  [a, a2, b, bMgr, c, platform] = await Promise.all([
    createUser("n3r-a"), createUser("n3r-a2"), createUser("n3r-b"), createUser("n3r-bmgr"), createUser("n3r-c"), createUser("n3r-admin", { platformAdmin: true }),
  ]);
  orgA = await createOrg(a, "N3R Agency A");
  orgB = await createOrg(b, "N3R Hiring B");
  orgC = await createOrg(c, "N3R Other C");
  await admin().from("organization_memberships").insert({ organization_id: orgB.id, user_id: bMgr.id, role: "recruiter_manager", status: "active" });
  await admin().from("organization_memberships").insert({ organization_id: orgA.id, user_id: a2.id, role: "recruiter", status: "active" });
});
beforeEach(() => {
  sql(`delete from app.rate_limits where user_id in ('${a.id}', '${a2.id}', '${b.id}', '${bMgr.id}', '${c.id}', '${platform.id}')`);
  // Org A files many reports across this file: earlier tests' reports mustn't trip its BR-20 limits (3 pending,
  // 10 per 90 days), which a dedicated test covers. Pending ones close as void; filing dates move out of the window.
  if (orgA) sql(`update app.hire_reports set status = case when status in ('awaiting_answer', 'unanswered', 'contested', 'in_review') then 'void' else status end,
                 filed_at = filed_at - interval '100 days' where source_org_id = '${orgA.id}'`);
});
afterEach(() => flag(false));

async function referred(clientName = `Client ${uniq()}`) {
  const job = await createJob(b, orgB.id, { title: `N3R ${uniq()}`, client_name: clientName, accepts_external_referrals: false });
  await publishTerms(b, job);
  const cand = await createCandidate(a, orgA.id, { email: `n3r-${uniq()}@example.com` });
  const consent = await sharingConsent(a, orgA.id, cand, job);
  const { data, error } = await a.client.rpc("submit_referral", {
    p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline", "skills"], p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID(),
  }).single();
  if (error || data?.outcome !== "created") throw new Error(error?.message ?? data?.outcome);
  return { job, cand, referralId: data.referral_id! };
}
const move = async (referralId: string, to: string, u: TestUser = b) => {
  const reason = ["declined", "rejected", "withdrawn", "cancelled"].includes(to) ? "Not the right fit for this role." : "";
  const { error } = await u.client.rpc("transition_referral", { p_referral: referralId, p_to: to as never, p_reason: reason, p_expected_version: (await referral(referralId)).version });
  if (error) throw new Error(`${to}: ${error.message}`);
};
const withAgreement = async (referralId: string) => {
  await move(referralId, "accepted");
  const { error } = await a.client.rpc("confirm_agreement", { p_referral: referralId });
  if (error) throw new Error(error.message);
};
/**
 * N3 v2.1 (QA-N3-02): after the per-user rate-limit hit, these RPCs return refusals as `{error: code}` (so the hit
 * commits) instead of raising. Normalised here to the same error object every refusal had before.
 */
const asError = async <R extends { data: unknown; error: unknown }>(p: PromiseLike<R>): Promise<R> => {
  const r = await p;
  const code = (r.data as { error?: string } | null)?.error;
  return code ? ({ ...r, data: null, error: { message: code, code: "P0001", details: null, hint: null } } as R) : r;
};
type Item = { type: string; item_date: string; captured_on?: string | null; url?: string | null; backs_tail?: boolean };
const item = (over: Partial<Item> = {}): Item => ({ type: "profile_change", item_date: daysAgo(2), url: "https://example.com/profile", ...over });
const file = (referralId: string, over: Record<string, unknown> = {}, u: TestUser = a, org = orgA.id) =>
  asError(u.client.rpc("file_hire_report", {
    p_referral: referralId, p_acting_org: org, p_employer: "Acme Analytics", p_start_month: month(), p_role: "Data analyst",
    p_learned_via: "profile", p_statement: "The candidate's public profile shows the new role at the client.", p_tail_statement: false,
    p_items: [item()], p_file_ids: [], p_attested: true, ...over,
  } as never));
const reportId = (referralId: string) => one(`select id from app.hire_reports where referral_id = '${referralId}' order by filed_at desc limit 1`);
const contest = (rid: string, over: Record<string, unknown> = {}, u: TestUser = b) =>
  asError(u.client.rpc("contest_hire_report", { p_report: rid, p_acting_org: orgB.id, p_reason: "not_hired",
    p_statement: "The client confirmed in writing that nobody was hired.", p_offer_accepted_on: null, p_process_started_on: null, p_file_ids: [], p_attested: true, ...over } as never));
const rebut = (rid: string, over: Record<string, unknown> = {}) =>
  asError(a.client.rpc("rebut_hire_report", { p_report: rid, p_acting_org: orgA.id, p_statement: "The company announcement names the candidate in the role.",
    p_items: [item({ type: "company_announcement" })], p_file_ids: [], p_attested: true, ...over } as never));
const decide = (rid: string, outcome: string, finding: string | null = null, u: TestUser = platform) =>
  u.client.rpc("admin_decide_hire_report", { p_report: rid, p_outcome: outcome, p_resolution: "Decided on the record after reviewing both sides.", p_finding: finding } as never);
const sweep = () => admin().rpc("run_hire_maintenance");
const hire = async (referralId: string, args: Record<string, unknown> = {}, u: TestUser = b) =>
  u.client.rpc("report_hire", { p_referral: referralId, p_start_date: today(), p_expected_version: (await referral(referralId)).version,
    p_terms_version: effectiveTerms(referralId), p_base_minor: 10_000_000, ...args } as never);
/** Uploads a PDF as `u` and registers it; `clean` marks the scan done (the worker's service-role path). */
async function evidence(referralId: string, kind: string, u: TestUser, org: string, clean = true) {
  const bytes = new TextEncoder().encode(`%PDF-1.4\n% ${randomUUID()}\n%%EOF\n`);
  const path = `${org}/${referralId}/${randomUUID()}.pdf`;
  const up = await u.client.storage.from("hire-evidence").upload(path, bytes, { contentType: "application/pdf" });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await u.client.rpc("register_hire_evidence", { p_referral: referralId, p_owner_kind: kind, p_storage_path: path, p_file_name: "proof.pdf", p_acting_org: org });
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  if (clean) {
    const r = await admin().rpc("record_hire_evidence_scan", { p_file: id, p_verdict: "clean", p_sha256: createHash("sha256").update(bytes).digest("hex") });
    if (r.error) throw new Error(r.error.message);
  }
  return id;
}

// ---------------------------------------------------------------------------------------------
describe("filing a hire report (BR-17 to BR-20, BR-23)", () => {
  it("files on an eligible referral: awaiting_answer, answer deadline stored, B's owner and managers notified, audit without content (AC-43)", async () => {
    const { referralId } = await referred();
    const since = dbNow();
    const res = await file(referralId);
    expect(res.error).toBeNull();
    const rid = (res.data as { report_id: string }).report_id;
    expect(report(rid)).toBe("awaiting_answer");
    expect(one(`select answer_due_at = app.add_business_days(filed_at, 10) from app.hire_reports where id = '${rid}'`)).toBe("t");
    for (const u of [b, bMgr]) expect(notes(u.id, "hire_report.filed", since), u.email).toHaveLength(1);
    expect(notes(a.id, "hire_report.filed", since)).toHaveLength(0);
    expect(one(`select count(*) from public.audit_events where entity_id = '${referralId}' and action = 'hire_report.filed' and metadata::text like '%Acme%'`)).toBe("0");
    expect(JSON.stringify(sql(`select body from public.notifications where kind = 'hire_report.filed' and created_at >= '${since}'`))).not.toMatch(/Acme|Client /);
  });

  it("every refusal is the same generic code; a recorded hire answers hire_already_recorded (AC-35, AC-36, AC-39)", async () => {
    const generic = async (referralId: string, u: TestUser = a, org = orgA.id) => {
      // v2.1 (QA-N3-02): refused attempts count toward the 5/h per-user bucket; this test makes more than 5.
      sql(`delete from app.rate_limits where user_id in ('${a.id}', '${a2.id}', '${b.id}', '${c.id}')`);
      const r = await file(referralId, {}, u, org);
      expect(r.data).toBeNull();
      return r.error?.message ?? "";
    };
    // pending report
    const p = await referred();
    expect((await file(p.referralId)).error).toBeNull();
    expect(await generic(p.referralId)).toMatch(/^hire_report_unavailable/);
    // released
    const rel = await referred();
    await move(rel.referralId, "declined");
    expect((await a.client.rpc("release_referral", { p_referral: rel.referralId, p_acting_org: orgA.id })).error).toBeNull();
    expect(await generic(rel.referralId)).toMatch(/^hire_report_unavailable/);
    // out of the tail (window ended > 9 months ago)
    const old = await referred();
    await move(old.referralId, "declined");
    replica(`update public.referrals set delivered_at = now() - interval '17 months', ownership_protected_until = now() - interval '10 months' where id = '${old.referralId}'`);
    expect(await generic(old.referralId)).toMatch(/^hire_report_unavailable/);
    // open objection (N1 claim)
    const obj = await referred();
    sql(`insert into app.referral_claims (referral_id, source_org_id, target_org_id, filed_by, evidence_kind, prior_process_date, attested_at, contest_deadline_at, status)
         select id, source_org_id, target_org_id, '${b.id}', 'file', current_date - 5, now(), now() + interval '3 days', 'open' from public.referrals where id = '${obj.referralId}'`);
    expect(await generic(obj.referralId)).toMatch(/^hire_report_unavailable/);
    // void
    const v = await referred();
    sql(`update app.referral_presentations set void_reason = 'authorization_void', voided_at = now() where referral_id = '${v.referralId}'`);
    expect(await generic(v.referralId)).toMatch(/^hire_report_unavailable/);
    // another org's referral, a random id, the hiring side, a recruiter outside record scope
    expect(await generic(p.referralId, c, orgC.id)).toMatch(/^hire_report_unavailable/);
    expect(await generic(randomUUID())).toMatch(/^hire_report_unavailable/);
    expect(await generic(p.referralId, b, orgB.id)).toMatch(/^hire_report_unavailable/);
    expect(await generic(p.referralId, a2)).toMatch(/^hire_report_unavailable/);
    // recorded hire
    const h = await referred();
    await withAgreement(h.referralId);
    expect((await hire(h.referralId)).error).toBeNull();
    sql(`delete from app.rate_limits where user_id = '${a.id}'`);
    expect((await file(h.referralId)).error?.message).toMatch(/^hire_already_recorded/);
    // no report row for any of them except the first
    expect(one(`select count(*) from app.hire_reports where referral_id in ('${rel.referralId}', '${old.referralId}', '${obj.referralId}', '${v.referralId}', '${h.referralId}')`)).toBe("0");
  });

  it("payload rules: items 1–5 with dates ≤ today, https links, start month range, statement and attestation (AC-41)", async () => {
    const { referralId } = await referred();
    const tomorrow = one(`select ((now() at time zone 'America/Toronto')::date + 1)::text`);
    for (const over of [
      { p_employer: "" }, { p_employer: "x".repeat(201) }, { p_role: "x".repeat(121) }, { p_learned_via: "rumour" }, { p_items: [] },
      { p_items: [item({ item_date: tomorrow })] }, { p_items: [item({ captured_on: daysAgo(5) })] }, { p_items: [item({ url: "http://x.com" })] },
      { p_statement: "too short" }, { p_attested: false }, { p_start_month: one(`select (date_trunc('month', now()) + interval '5 months')::date::text`) },
      { p_start_month: daysAgo(0) === month() ? daysAgo(-1) : today() },
    ]) expect((await file(referralId, over)).error?.message, JSON.stringify(over)).toMatch(/^hire_report_invalid/);
    // A screenshot with no link and no capture date is accepted.
    expect((await file(referralId, { p_items: [{ type: "other", item_date: daysAgo(1) }] })).error).toBeNull();
  });

  it("BR-6 tail: after window + 6 months the statement and a backing item are required; after + 9 refused (AC-12)", async () => {
    const { referralId } = await referred();
    await move(referralId, "declined");
    replica(`update public.referrals set delivered_at = now() - interval '13 months', ownership_protected_until = now() - interval '7 months' where id = '${referralId}'`);
    expect((await file(referralId)).error?.message).toMatch(/^hire_report_tail_required/);
    expect((await file(referralId, { p_tail_statement: true })).error?.message).toMatch(/^hire_report_tail_required/);
    expect((await file(referralId, { p_tail_statement: true, p_items: [item({ backs_tail: true })] })).error).toBeNull();
    const { data } = await a.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgA.id });
    expect(data).toMatchObject({ report_tail: true, can_report: false });
  });

  it("org limits: 3 pending, then hire_report_rate_limited (AC-37)", async () => {
    const org = await createUser("n3r-lim");
    const orgL = await createOrg(org, "N3R Limits L");
    const refs: string[] = [];
    for (let i = 0; i < 4; i++) {
      const job = await createJob(b, orgB.id, { title: `Lim ${uniq()}`, client_name: `Client ${uniq()}` });
      const cand = await createCandidate(org, orgL.id, { email: `lim-${uniq()}@example.com` });
      const consent = await sharingConsent(org, orgL.id, cand, job);
      const { data } = await org.client.rpc("submit_referral", { p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline"],
        p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID() }).single();
      refs.push(data!.referral_id!);
    }
    for (let i = 0; i < 3; i++) expect((await file(refs[i], {}, org, orgL.id)).error, String(i)).toBeNull();
    expect((await file(refs[3], {}, org, orgL.id)).error?.message).toMatch(/^hire_report_rate_limited/);
  });

  it("second report after a rejection needs a newer item; none after two rejections (AC-38)", async () => {
    const { referralId } = await referred();
    for (let round = 0; round < 2; round++) {
      expect((await file(referralId, { p_items: [item({ item_date: daysAgo(round === 0 ? 3 : 0) })] })).error, `round ${round}`).toBeNull();
      const rid = reportId(referralId);
      sql(`update app.hire_reports set status = 'unanswered', decide_by = now() where id = '${rid}'`);
      expect((await decide(rid, "rejected", "not_hired")).error).toBeNull();
      if (round === 0) {
        sql(`update app.hire_reports set resolved_at = now() - interval '2 days' where id = '${rid}'`);
        expect((await file(referralId, { p_items: [item({ item_date: daysAgo(3) })] })).error?.message).toMatch(/^hire_report_unavailable/);
      }
    }
    expect((await file(referralId, { p_items: [item({ item_date: today() })] })).error?.message).toMatch(/^hire_report_unavailable/);
    const { data } = await a.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgA.id });
    expect(data).toMatchObject({ can_report: false });
  });
});

describe("evidence files and side-shaped views (BR-18, BR-19, BR-25)", () => {
  it("files go through the pipeline; unready files are refused; B sees n, time and SHA-256 only, A sees its own (AC-42, AC-44, AC-45)", async () => {
    const { referralId } = await referred();
    const pending = await evidence(referralId, "hire_report", a, orgA.id, false);
    expect((await file(referralId, { p_file_ids: [pending] })).error?.message).toMatch(/^hire_report_files_not_ready/);
    sql(`select 1`); // the scan arrives
    await admin().rpc("record_hire_evidence_scan", { p_file: pending, p_verdict: "clean", p_sha256: "a".repeat(64) });
    // The hiring side can't register files for the sourcing side's purposes, nor read A's drafts.
    expect((await b.client.rpc("list_hire_evidence_files", { p_referral: referralId, p_owner_kind: "hire_report", p_acting_org: orgB.id })).error?.message).toMatch(/^not_found/);
    expect((await file(referralId, { p_file_ids: [pending] })).error).toBeNull();
    const { data: bView } = await b.client.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: orgB.id });
    const bJson = JSON.stringify(bView);
    expect(bJson).not.toMatch(/https:\/\/example|proof\.pdf|hire-evidence|storage_path/);
    expect((bView as { files: unknown[] }[])[0].files).toEqual([{ n: 1, uploaded_at: expect.any(String), sha256: "a".repeat(64) }]);
    const { data: aView } = await a.client.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: orgA.id });
    expect(JSON.stringify(aView)).toMatch(/https:\/\/example\.com\/profile/);
    expect((aView as { files: { file_name: string }[] }[])[0].files[0].file_name).toBe("proof.pdf");
    // Downloads: A's own file yes (audited), B no, admin yes.
    expect((await a.client.rpc("authorize_hire_evidence", { p_file: pending, p_acting_org: orgA.id })).error).toBeNull();
    expect((await b.client.rpc("authorize_hire_evidence", { p_file: pending, p_acting_org: orgB.id })).error?.message).toMatch(/^not_found/);
    expect((await b.client.rpc("authorize_hire_evidence", { p_file: pending })).error?.message).toMatch(/^not_found/);
    expect((await platform.client.rpc("authorize_hire_evidence", { p_file: pending })).error).toBeNull();
    expect(one(`select count(*) from public.audit_events where action = 'hire_evidence.accessed' and entity_id = '${referralId}'`)).toBe("2");
    // Other orgs can't even upload under the referral.
    const up = await c.client.storage.from("hire-evidence").upload(`${orgC.id}/${referralId}/${randomUUID()}.pdf`, new Uint8Array([1]), { contentType: "application/pdf" });
    expect(up.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe("release block (BR-21) and competing records (BR-22)", () => {
  it("a pending report blocks release on every referral of A at B with an overlapping key; released again once resolved (AC-47)", async () => {
    const client = `Shared Client ${uniq()}`;
    const r1 = await referred(client);
    const r2 = await referred(client);
    const r3 = await referred(); // another client
    for (const r of [r2, r3]) await move(r.referralId, "declined");
    expect((await file(r1.referralId)).error).toBeNull();
    expect((await a.client.rpc("release_referral", { p_referral: r2.referralId, p_acting_org: orgA.id })).error?.message).toMatch(/^release_not_allowed/);
    const { data: pres } = await a.client.rpc("get_referral_presentation", { p_referral: r2.referralId, p_acting_org: orgA.id });
    expect((pres as { can_release: boolean }).can_release).toBe(false);
    // B sees no difference.
    const { data: bPres } = await b.client.rpc("get_referral_presentation", { p_referral: r2.referralId, p_acting_org: orgB.id });
    expect(JSON.stringify(bPres)).not.toMatch(/release/);
    expect((await a.client.rpc("release_referral", { p_referral: r3.referralId, p_acting_org: orgA.id })).error).toBeNull();
    const rid = reportId(r1.referralId);
    sql(`update app.hire_reports set status = 'unanswered', decide_by = now() where id = '${rid}'`);
    expect((await decide(rid, "rejected", "not_hired")).error).toBeNull();
    expect((await a.client.rpc("release_referral", { p_referral: r2.referralId, p_acting_org: orgA.id })).error).toBeNull();
  });

  it("B's record closes a pending report: confirmed through Confirm, closed_by_record otherwise (AC-48, AC-52, AC-67)", async () => {
    const r1 = await referred();
    await withAgreement(r1.referralId);
    expect((await file(r1.referralId)).error).toBeNull();
    const rid1 = reportId(r1.referralId);
    let since = dbNow();
    expect((await hire(r1.referralId, { p_report: rid1 })).error).toBeNull();
    expect(report(rid1)).toBe("confirmed");
    expect(notes(a.id, "hire_report.confirmed", since)).toHaveLength(1);
    // Contested report + record → closed_by_record and the dispute closes.
    const r2 = await referred();
    await withAgreement(r2.referralId);
    expect((await file(r2.referralId)).error).toBeNull();
    const rid2 = reportId(r2.referralId);
    expect((await contest(rid2)).error).toBeNull();
    since = dbNow();
    expect((await hire(r2.referralId, { p_report: rid2 })).error).toBeNull();
    expect(report(rid2)).toBe("closed_by_record");
    expect(one(`select d.status || '/' || d.outcome from public.disputes d join app.hire_reports h on h.dispute_id = d.id where h.id = '${rid2}'`)).toBe("resolved/hire_closed_by_record");
    expect(notes(a.id, "hire_report.closed_by_record", since)).toHaveLength(1);
    const { data: aView } = await a.client.rpc("get_hire_reports", { p_referral: r2.referralId, p_acting_org: orgA.id });
    expect((aView as { status: string; placement_id: string }[])[0]).toMatchObject({ status: "closed_by_record", placement_id: expect.any(String) });
  });
});

describe("contest and rebuttal (BR-25, BR-26)", () => {
  it("contest opens a hire_report dispute, sets the rebuttal deadline, notifies A; not_this_client keeps B's statement admin-only (AC-53, AC-55)", async () => {
    const { referralId } = await referred();
    expect((await file(referralId)).error).toBeNull();
    const rid = reportId(referralId);
    for (const over of [{ p_reason: "already_had_them" }, { p_reason: "outside_window" }, { p_reason: "outside_window", p_offer_accepted_on: daysAgo(3), p_process_started_on: daysAgo(1) },
      { p_statement: "short" }, { p_attested: false }]) {
      expect((await contest(rid, over)).error?.message, JSON.stringify(over)).toMatch(/^hire_contest_invalid/);
    }
    expect((await contest(rid, {}, a)).error?.message).toMatch(/^not_found/);
    const since = dbNow();
    const statement = "The employer named is a different company altogether.";
    const f = await evidence(referralId, "hire_contest", b, orgB.id);
    expect((await contest(rid, { p_reason: "not_this_client", p_statement: statement, p_file_ids: [f] })).error).toBeNull();
    expect(one(`select status || '/' || (rebuttal_due_at = app.add_business_days(contested_at, 5)) from app.hire_reports where id = '${rid}'`)).toBe("contested/true");
    expect(one(`select d.kind || '/' || d.status from public.disputes d join app.hire_reports h on h.dispute_id = d.id where h.id = '${rid}'`)).toBe("hire_report/open");
    expect(notes(a.id, "hire_report.contested", since)).toHaveLength(1);
    const { data: aView } = await a.client.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: orgA.id });
    expect((aView as { contest: { reason: string; statement: string | null; files: unknown[] } }[])[0].contest).toMatchObject({ reason: "not_this_client", statement: null, files: [] });
    const { data: bView } = await b.client.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: orgB.id });
    expect((bView as { contest: { statement: string; files: unknown[] } }[])[0].contest.statement).toBe(statement);
    expect((await contest(rid)).error?.message).toMatch(/^hire_report_answer_closed/);
    // Members don't read hire_report disputes directly.
    expect((await a.client.from("disputes").select("id").eq("referral_id", referralId)).data).toEqual([]);
    expect((await b.client.from("disputes").select("id").eq("referral_id", referralId)).data).toEqual([]);
  });

  it("contest after the answer deadline is closed; another open dispute blocks it (AC-54)", async () => {
    const { referralId } = await referred();
    expect((await file(referralId)).error).toBeNull();
    const rid = reportId(referralId);
    sql(`update app.hire_reports set answer_due_at = now() - interval '1 minute' where id = '${rid}'`);
    expect((await contest(rid)).error?.message).toMatch(/^hire_report_answer_closed/);
    sql(`update app.hire_reports set answer_due_at = now() + interval '3 days' where id = '${rid}'`);
    sql(`insert into public.disputes (kind, referral_id, hire_report_id, opened_by, opened_by_org, reason) values ('hire_report', '${referralId}', '${rid}', '${b.id}', '${orgB.id}', 'Existing open dispute')`);
    expect((await contest(rid)).error?.message).toMatch(/^dispute_already_open/);
  });

  it("one rebuttal before the deadline moves to in_review with decide_by; a second or late one is closed (AC-56, AC-57)", async () => {
    const { referralId } = await referred();
    expect((await file(referralId)).error).toBeNull();
    const rid = reportId(referralId);
    expect((await contest(rid)).error).toBeNull();
    const since = dbNow();
    expect((await rebut(rid)).error).toBeNull();
    expect(one(`select status || '/' || (decide_by = app.add_business_days(rebuttal_due_at, 10)) from app.hire_reports where id = '${rid}'`)).toBe("in_review/true");
    expect(notes(b.id, "hire_report.rebuttal", since)).toHaveLength(1);
    expect((await rebut(rid)).error?.message).toMatch(/^hire_rebuttal_closed/);
    // Late: the sweep moves an unrebutted report to in_review.
    const r2 = await referred();
    expect((await file(r2.referralId)).error).toBeNull();
    const rid2 = reportId(r2.referralId);
    expect((await contest(rid2)).error).toBeNull();
    sql(`update app.hire_reports set rebuttal_due_at = now() - interval '1 minute' where id = '${rid2}'`);
    expect((await rebut(rid2)).error?.message).toMatch(/^hire_rebuttal_closed/);
    expect((await sweep()).error).toBeNull();
    expect(report(rid2)).toBe("in_review");
  });
});

// ---------------------------------------------------------------------------------------------
describe("clocks and the silence gate (BR-23, BR-29, BR-44)", () => {
  const seed = (rid: string, userId: string, status = "delivered") =>
    sql(`insert into app.email_deliveries (notification_kind, entity_type, entity_id, recipient_user_id, provider_message_id, status)
         values ('hire_report.filed', 'hire_report', '${rid}', '${userId}', '${randomUUID()}', '${status}')`);
  async function due() {
    const { referralId } = await referred();
    await withAgreement(referralId);
    expect((await file(referralId)).error).toBeNull();
    const rid = reportId(referralId);
    sql(`update app.hire_reports set answer_due_at = now() - interval '1 minute' where id = '${rid}'`);
    return { referralId, rid };
  }

  it("reminders at business days 5 and 8, once each, to B only (AC-51)", async () => {
    const { referralId } = await referred();
    expect((await file(referralId)).error).toBeNull();
    const rid = reportId(referralId);
    sql(`update app.hire_reports set filed_at = now() - interval '9 days', answer_due_at = now() + interval '2 days' where id = '${rid}'`);
    const since = dbNow();
    await sweep();
    await sweep();
    expect(notes(b.id, "hire_report.reminder", since).length).toBeGreaterThanOrEqual(1);
    expect(notes(b.id, "hire_report.reminder", since).length).toBeLessThanOrEqual(2);
    expect(notes(a.id, "hire_report.reminder", since)).toHaveLength(0);
    expect(one(`select reminded_d5_at is not null from app.hire_reports where id = '${rid}'`)).toBe("t");
  });

  it("no delivery records → unanswered (admin queue), never deemed, no placement (AC-62)", async () => {
    const { referralId, rid } = await due();
    expect((await sweep()).error).toBeNull();
    expect(report(rid)).toBe("unanswered");
    expect(one(`select count(*) from public.placements where referral_id = '${referralId}'`)).toBe("0");
    const { data: q } = await platform.client.rpc("admin_list_hire_reports");
    expect((q ?? []).find((x) => x.id === rid)).toMatchObject({ section: "decide", status: "unanswered" });
  });

  it("delivered to the job owner and a manager → deemed, fee-pending placement, both notified (AC-63)", async () => {
    const { referralId, rid } = await due();
    seed(rid, b.id);
    seed(rid, bMgr.id);
    const since = dbNow();
    expect((await sweep()).error).toBeNull();
    expect(report(rid)).toBe("deemed_confirmed");
    expect(one(`select status || '/' || established_how from public.placements where referral_id = '${referralId}'`)).toBe("fee_pending/deemed");
    expect(notes(a.id, "hire_report.deemed", since)).toHaveLength(1);
    expect(notes(b.id, "hire_report.deemed", since)).toHaveLength(1);
  });

  it("owner only, a bounce, or the same person twice → unanswered (AC-64)", async () => {
    const r1 = await due();
    seed(r1.rid, b.id);
    const r2 = await due();
    seed(r2.rid, b.id);
    seed(r2.rid, bMgr.id);
    seed(r2.rid, bMgr.id, "bounced");
    const r3 = await due();
    seed(r3.rid, b.id);
    seed(r3.rid, b.id);
    await sweep();
    for (const r of [r1, r2, r3]) expect(report(r.rid)).toBe("unanswered");
  });

  it("no active job owner, or B suspended → unanswered even with two delivered records (AC-103, AC-93)", async () => {
    const r1 = await due();
    seed(r1.rid, b.id);
    seed(r1.rid, bMgr.id);
    const other = await createUser("n3r-bmgr2");
    await admin().from("organization_memberships").insert({ organization_id: orgB.id, user_id: other.id, role: "org_admin", status: "active" });
    seed(r1.rid, other.id);
    // The job owner leaves.
    sql(`update public.organization_memberships set status = 'suspended' where organization_id = '${orgB.id}' and user_id = '${b.id}'`);
    try {
      await sweep();
      expect(report(r1.rid)).toBe("unanswered");
    } finally {
      sql(`update public.organization_memberships set status = 'active' where organization_id = '${orgB.id}' and user_id = '${b.id}'`);
    }
    const r2 = await due();
    seed(r2.rid, b.id);
    seed(r2.rid, bMgr.id);
    sql(`update public.organizations set suspended_at = now() where id = '${orgB.id}'`);
    try {
      await sweep();
      expect(report(r2.rid)).toBe("unanswered");
    } finally {
      sql(`update public.organizations set suspended_at = null where id = '${orgB.id}'`);
    }
  });
});

describe("admin decision and tools (BR-27, BR-28, BR-40)", () => {
  it("uphold → fee-pending placement on the deemed agreement (flag on) and both notified; no amounts accepted (AC-58, AC-60, AC-25)", async () => {
    flag(true);
    const { referralId } = await referred();
    expect((await file(referralId)).error).toBeNull();
    const rid = reportId(referralId);
    expect((await contest(rid)).error).toBeNull();
    expect((await rebut(rid)).error).toBeNull();
    for (const u of [a, b]) expect((await decide(rid, "upheld", null, u)).error?.message).toMatch(/^not_found/);
    const forged = await platform.client.rpc("admin_decide_hire_report", { p_report: rid, p_outcome: "upheld", p_resolution: "x".repeat(30), p_fee_minor: 1 } as never);
    expect(forged.error).not.toBeNull();
    const since = dbNow();
    const res = await decide(rid, "upheld");
    expect(res.error).toBeNull();
    expect(report(rid)).toBe("upheld");
    expect(one(`select status || '/' || coalesce(contracted_fee_minor::text, 'null') from public.placements where referral_id = '${referralId}'`)).toBe("fee_pending/null");
    expect(one(`select origin from public.collaboration_agreements where referral_id = '${referralId}'`)).toBe("deemed");
    expect(notes(a.id, "hire_report.decided", since)).toHaveLength(1);
    expect(notes(b.id, "hire_report.decided", since)).toHaveLength(1);
    expect(one(`select d.outcome from public.disputes d join app.hire_reports h on h.dispute_id = d.id where h.id = '${rid}'`)).toBe("hire_upheld");
  });

  it("uphold with the flag off and no agreement records the hire without a split (AC-25)", async () => {
    const { referralId } = await referred();
    expect((await file(referralId)).error).toBeNull();
    const rid = reportId(referralId);
    sql(`update app.hire_reports set status = 'unanswered', decide_by = now() where id = '${rid}'`);
    const { data: detail } = await platform.client.rpc("admin_get_hire_report", { p_report: rid });
    expect(detail).toMatchObject({ uphold_creates_placement: false, can_decide: true });
    expect((await decide(rid, "upheld")).error).toBeNull();
    expect(one(`select kind from public.hire_records where referral_id = '${referralId}'`)).toBe("record_only_no_agreement");
  });

  it("reject with not_this_client: A sees only that (no resolution), B sees the resolution; HA-6 lists 2 rejections in 90 days (AC-46, AC-59, AC-85)", async () => {
    const since = dbNow();
    const rids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { referralId } = await referred();
      expect((await file(referralId)).error).toBeNull();
      const rid = reportId(referralId);
      sql(`update app.hire_reports set status = 'unanswered', decide_by = now() where id = '${rid}'`);
      expect((await decide(rid, "rejected", "not_this_client")).error).toBeNull();
      rids.push(referralId);
    }
    const { data: aView } = await a.client.rpc("get_hire_reports", { p_referral: rids[0], p_acting_org: orgA.id });
    expect((aView as Record<string, unknown>[])[0]).toMatchObject({ status: "rejected", not_this_client: true, resolution: null });
    const { data: bView } = await b.client.rpc("get_hire_reports", { p_referral: rids[0], p_acting_org: orgB.id });
    expect((bView as { resolution: string }[])[0].resolution).toMatch(/Decided on the record/);
    expect(notes(a.id, "hire_report.decided", since).every((x) => /not this client/.test(x))).toBe(true);
    expect(JSON.stringify(notes(a.id, "hire_report.decided", since))).not.toMatch(/Decided on the record/);
    const { data: flags } = await platform.client.rpc("admin_hire_report_flags");
    expect((flags ?? []).find((f) => f.organization_id === orgA.id)?.rejected_90d).toBeGreaterThanOrEqual(2);
    expect((await a.client.rpc("admin_hire_report_flags")).error?.message).toMatch(/^not_found/);
  });

  it("admin detail: both keys, links, files, delivery records; fields saved and audited; nothing for members (AC-61)", async () => {
    const { referralId } = await referred();
    expect((await file(referralId)).error).toBeNull();
    const rid = reportId(referralId);
    const { data } = await platform.client.rpc("admin_get_hire_report", { p_report: rid });
    const d = data as Record<string, Record<string, unknown>>;
    expect(d.client.commit_key).toBeTruthy();
    expect(JSON.stringify(d.report)).toMatch(/https:\/\/example\.com\/profile/);
    expect(d.delivery_records).toEqual([]);
    expect((await platform.client.rpc("admin_set_hire_report_fields", { p_report: rid, p_candidate_contacts: 1, p_client_confirmation: "requested", p_note: "Asked B for the client's letter." })).error).toBeNull();
    expect((await platform.client.rpc("admin_set_hire_report_fields", { p_report: rid, p_candidate_contacts: 6, p_client_confirmation: "requested", p_note: "" })).error?.message).toMatch(/^hire_admin_fields_invalid/);
    expect(one(`select count(*) from public.audit_events where action = 'hire_report.admin_fields_saved' and entity_id = '${referralId}' and organization_id is null`)).toBe("1");
    for (const u of [a, b, c]) {
      expect((await u.client.rpc("admin_get_hire_report", { p_report: rid })).error?.message).toMatch(/^not_found/);
      expect(JSON.stringify((await u.client.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: u === a ? orgA.id : orgB.id })).data ?? "")).not.toMatch(/Asked B|candidate_contacts|client_confirmation/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("authorization check (BR-37, BR-38)", () => {
  it("B requests once in a contested report; admin opens with evidence request; A sends evidence; invalid voids everything (AC-79 to AC-81)", async () => {
    const { referralId } = await referred();
    expect((await file(referralId)).error).toBeNull();
    const rid = reportId(referralId);
    const req = (u = b) => asError(u.client.rpc("request_authorization_check", { p_referral: referralId, p_acting_org: orgB.id, p_reason: "We doubt the candidate agreed to be presented.", p_file_ids: [] }));
    expect((await req()).error?.message).toMatch(/^auth_check_not_available/);
    expect((await contest(rid)).error).toBeNull();
    expect((await req()).error).toBeNull();
    expect((await req()).error?.message).toMatch(/^auth_check_already_requested/);
    const { data: bView } = await b.client.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: orgB.id });
    expect((bView as { auth_check_requested_at: string | null }[])[0].auth_check_requested_at).not.toBeNull();
    const { data: aView } = await a.client.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: orgA.id });
    expect(JSON.stringify(aView)).not.toMatch(/doubt/);
    // Admin opens it with challenger evidence → 5-business-day evidence request to A.
    let since = dbNow();
    const open = await platform.client.rpc("admin_open_authorization_check", { p_referral: referralId, p_requested_by: "hiring_side", p_challenger_evidence: true });
    expect(open.error).toBeNull();
    const checkId = (open.data as { id: string }).id;
    expect(one(`select evidence_due_at = app.add_business_days(opened_at, 5) from app.authorization_checks where id = '${checkId}'`)).toBe("t");
    expect(notes(a.id, "auth_check.requested", since)).toHaveLength(1);
    const { data: aState } = await a.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgA.id });
    expect(aState).toMatchObject({ auth_check: { id: checkId, status: "open", can_send_evidence: true } });
    const { data: bState } = await b.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgB.id });
    expect(bState).not.toHaveProperty("auth_check");
    const ev = await evidence(referralId, "auth_evidence", a, orgA.id);
    const send = (ids: string[]) => a.client.rpc("submit_authorization_evidence", { p_check: checkId, p_acting_org: orgA.id, p_statement: "The candidate's message from their personal email, dated.", p_file_ids: ids, p_attested: true });
    expect((await send([])).error?.message).toMatch(/^auth_check_invalid/);
    expect((await send([ev])).error).toBeNull();
    expect((await send([ev])).error?.message).toMatch(/^auth_check_closed/);
    // Invalid → void.
    since = dbNow();
    const dec = await platform.client.rpc("admin_decide_authorization_check", { p_check: checkId, p_valid: false, p_resolution: "The candidate denies agreeing to the presentation.", p_candidate_contacted: true });
    expect(dec.error).toBeNull();
    expect(one(`select void_reason from app.referral_presentations where referral_id = '${referralId}'`)).toBe("authorization_void");
    expect(one(`select app.presentation_counts('${referralId}')`)).toBe("f");
    expect(one(`select k.disputed_at is not null from public.candidate_consents k join public.referral_candidate_links l on l.consent_id = k.id where l.referral_id = '${referralId}'`)).toBe("t");
    expect(report(rid)).toBe("void");
    expect(one(`select breach_review from app.authorization_checks where id = '${checkId}'`)).toBe("t");
    expect(notes(a.id, "auth_check.decided", since)).toHaveLength(1);
    expect((await file(referralId)).error?.message).toMatch(/^hire_report_unavailable/);
    const { data: own } = await b.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgB.id });
    expect(own).toMatchObject({ ownership: "void", can_record: false });
  });

  it("without a recent-change note or challenger evidence the admin decides on the record; valid changes nothing (AC-80, AC-82)", async () => {
    const { referralId } = await referred();
    const since = dbNow();
    const open = await platform.client.rpc("admin_open_authorization_check", { p_referral: referralId, p_requested_by: "candidate", p_challenger_evidence: false });
    expect(open.data).toMatchObject({ evidence_due_at: null, recent_change_note: false });
    expect(notes(a.id, "auth_check.requested", since)).toHaveLength(0);
    for (const u of [a, b]) expect((await u.client.rpc("admin_open_authorization_check", { p_referral: referralId, p_requested_by: "candidate", p_challenger_evidence: false })).error?.message).toMatch(/^not_found/);
    expect((await platform.client.rpc("admin_decide_authorization_check", { p_check: (open.data as { id: string }).id, p_valid: true, p_resolution: "The candidate confirmed by phone through a number A didn't set." })).error).toBeNull();
    expect(one(`select coalesce(void_reason, 'none') from app.referral_presentations where referral_id = '${referralId}'`)).toBe("none");
  });

  it("record-created note: the candidate record created within 30 days before token issuance shows to A only (AC-83)", async () => {
    const job = await createJob(b, orgB.id, { title: `Tok ${uniq()}`, client_name: `Client ${uniq()}` });
    const cand = await createCandidate(a, orgA.id, { email: `tok-${uniq()}@example.com` });
    const { data: sub, error } = await a.client.rpc("submit_referral_for_candidate", {
      p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline"], p_document_ids: [], p_note: null, p_idempotency_key: randomUUID(),
    } as never).single();
    if (error) throw new Error(error.message);
    const referralId = (sub as { referral_id: string }).referral_id;
    expect((await admin().rpc("issue_candidate_request_token", { p_referral: referralId, p_actor: a.id })).error).toBeNull();
    const { data: st } = await a.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgA.id });
    expect((st as { record_created_at: string | null }).record_created_at).not.toBeNull();
    sql(`update public.candidates set created_at = now() - interval '31 days' where id = '${cand}'`);
    const { data: st2 } = await a.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgA.id });
    expect((st2 as { record_created_at: string | null }).record_created_at).toBeNull();
  });
});

describe("PD-077 conditions", () => {
  it("start and acceptance dates lie within [delivery − 1 year, today + 548 days] (hire_dates_invalid)", async () => {
    const { referralId } = await referred();
    await withAgreement(referralId);
    const floor = one(`select ((delivered_at at time zone 'America/Toronto')::date - interval '1 year')::date::text from public.referrals where id = '${referralId}'`);
    const before = one(`select ('${floor}'::date - 1)::text`);
    expect((await hire(referralId, { p_start_date: before })).error?.message).toMatch(/^hire_dates_invalid/);
    expect((await hire(referralId, { p_start_date: today(), p_offer_accepted_on: before })).error?.message).toMatch(/^hire_dates_invalid/);
    expect((await hire(referralId, { p_start_date: one(`select ((now() at time zone 'America/Toronto')::date + 549)::text`) })).error?.message).toMatch(/^hire_dates_invalid/);
    expect((await hire(referralId, { p_start_date: one(`select ((now() at time zone 'America/Toronto')::date + 548)::text`), p_offer_accepted_on: floor })).error).toBeNull();
  });

  it("the member who accepted the referral still records the hire on the offer happy path when record scope shows it to them", async () => {
    // A plain recruiter of B who owns the job accepts, then records — the pre-N3 path (PD-077 #2).
    const owner = await createUser("n3r-jobowner");
    await admin().from("organization_memberships").insert({ organization_id: orgB.id, user_id: owner.id, role: "recruiter", status: "active" });
    const job = await createJob(owner, orgB.id, { title: `Own ${uniq()}`, client_name: `Client ${uniq()}`, accepts_external_referrals: false });
    await publishTerms(owner, job);
    const cand = await createCandidate(a, orgA.id, { email: `own-${uniq()}@example.com` });
    const consent = await sharingConsent(a, orgA.id, cand, job);
    const { data } = await a.client.rpc("submit_referral", { p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline"],
      p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID() }).single();
    const referralId = data!.referral_id!;
    await move(referralId, "accepted", owner);
    expect((await a.client.rpc("confirm_agreement", { p_referral: referralId })).error).toBeNull();
    await move(referralId, "interviewing", owner);
    await move(referralId, "offer", owner);
    const res = await hire(referralId, {}, owner);
    expect(res.error).toBeNull();
    expect(res.data).toBeTruthy();
    // A plain recruiter outside record scope (not the job owner) still can't.
    const other = await referred();
    const rec = await createUser("n3r-brec");
    await admin().from("organization_memberships").insert({ organization_id: orgB.id, user_id: rec.id, role: "recruiter", status: "active" });
    await withAgreement(other.referralId);
    expect((await hire(other.referralId, {}, rec)).error?.message).toMatch(/^not_found/);
  });
});

describe("v2 frontend requests: placement fee state", () => {
  it("returns business days left and the PD-077 start window to both orgs; not_found to others", async () => {
    const { referralId } = await referred();
    await withAgreement(referralId);
    const pid = one(`select app.establish_hire('${referralId}', 'upheld')`);
    for (const u of [a, b]) {
      const { data, error } = await u.client.rpc("get_placement_fee_state", { p_placement: pid });
      expect(error, u.email).toBeNull();
      expect(data).toMatchObject({ status: "fee_pending", fee_details_overdue: false, fee_details_business_days_left: 10 });
      expect((data as { start_date_min: string }).start_date_min).toBe(
        one(`select ((delivered_at at time zone 'America/Toronto')::date - interval '1 year')::date::text from public.referrals where id = '${referralId}'`));
    }
    for (const u of [c, a2]) expect((await u.client.rpc("get_placement_fee_state", { p_placement: pid })).error?.message, u.email).toMatch(/^not_found/);
  });
});

describe("fix loop round 1 (v2.1)", () => {
  it("QA-N3-06: a Confirm records origin report_confirmed; B's own record keeps target_record", async () => {
    const r1 = await referred();
    await withAgreement(r1.referralId);
    expect((await file(r1.referralId)).error).toBeNull();
    expect((await hire(r1.referralId, { p_report: reportId(r1.referralId) })).error).toBeNull();
    expect(one(`select origin from public.hire_records where referral_id = '${r1.referralId}'`)).toBe("report_confirmed");
    const r2 = await referred();
    await withAgreement(r2.referralId);
    expect((await file(r2.referralId)).error).toBeNull();
    expect((await hire(r2.referralId)).error).toBeNull();
    expect(one(`select origin from public.hire_records where referral_id = '${r2.referralId}'`)).toBe("target_record");
  });

  it("gap 3: hire_already_recorded carries the placement id the sourcing side can open", async () => {
    const { referralId } = await referred();
    await withAgreement(referralId);
    const h = await hire(referralId);
    const raw = await a.client.rpc("file_hire_report", { p_referral: referralId, p_acting_org: orgA.id, p_employer: "Acme", p_start_month: month(), p_role: "",
      p_learned_via: "profile", p_statement: "The candidate's public profile shows the new role at the client.", p_tail_statement: false,
      p_items: [item()], p_file_ids: [], p_attested: true } as never);
    expect(raw.error).toBeNull();
    expect(raw.data).toEqual({ error: "hire_already_recorded", placement_id: h.data });
    expect((await a.client.from("placements").select("id").eq("id", h.data as string)).data).toHaveLength(1);
  });

  it("gap 4: admin queue rows and the detail carry business days left", async () => {
    const { referralId } = await referred();
    expect((await file(referralId)).error).toBeNull();
    const rid = reportId(referralId);
    const { data: rows } = await platform.client.rpc("admin_list_hire_reports");
    expect((rows ?? []).find((x) => x.id === rid)).toMatchObject({ section: "waiting", deadline_business_days_left: 10 });
    const { data: d } = await platform.client.rpc("admin_get_hire_report", { p_report: rid });
    expect(d).toMatchObject({ answer_business_days_left: 10, rebuttal_business_days_left: null, decide_business_days_left: null });
  });

  it("QA-N3-03: the documented HA-1 query reads app.hire_reports and returns a hiring org with 2 such hires, not with 1", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const file_ = readFileSync(path.resolve(import.meta.dirname, "../../docs/ops/n3-hire-signals.sql"), "utf8");
    const body = file_.split("-- name: ha1_hires_first_reported_by_source")[1].split("\n\n")[0].split("\n").slice(1).join("\n").replace(/;\s*$/, "");
    const ha1 = () => sql(`select hiring_org_id || '=' || hires_first_reported_by_source from (${body}) q`);
    const hb = await createUser("n3r-ha1");
    const orgH = await createOrg(hb, "N3R HA1 Hiring");
    const refFor = async () => {
      const job = await createJob(hb, orgH.id, { title: `HA1 ${uniq()}`, client_name: `Client ${uniq()}` });
      const cand = await createCandidate(a, orgA.id, { email: `ha1-${uniq()}@example.com` });
      const consent = await sharingConsent(a, orgA.id, cand, job);
      const { data } = await a.client.rpc("submit_referral", { p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline"],
        p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID() }).single();
      return data!.referral_id!;
    };
    const r1 = await refFor();
    expect((await file(r1)).error).toBeNull();
    sql(`update app.hire_reports set status = 'closed_by_record', resolved_at = now() where referral_id = '${r1}'`);
    expect(ha1().some((x) => x.startsWith(orgH.id))).toBe(false);
    const r2 = await refFor();
    expect((await file(r2)).error).toBeNull();
    sql(`update app.hire_reports set status = 'upheld', resolved_at = now(), resolution = 'Upheld on the record after review.' where referral_id = '${r2}'`);
    expect(ha1()).toContain(`${orgH.id}=2`);
  });
});
