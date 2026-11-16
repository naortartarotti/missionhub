import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { admin, anon, createCandidate, createJob, createOrg, createUser, dbNow, effectiveTerms, publishTerms, sharingConsent, sql, termsOf, type TestUser } from "./helpers";
import { scanHireEvidence } from "@/server/queue/handlers/hire-evidence";

/**
 * N3 QA pass (docs/specs/referral-claims-two-sided-hire/qa-report.md). Adversarial cases the backend suites
 * (n3-record-hire, n3-hire-reports) don't cover: no-oracle refusals compared field by field, the rolling 90-day
 * and per-user limits, the evidence bucket and file purposes, not_this_client leakage, money and PD-077 bounds on
 * complete_fee_details, IDOR across every new RPC, suspended parties, notification recipients, audit metadata,
 * SECURITY DEFINER / search_path / grants, the fee-pending ↔ placement-dispute round trip, exact reminder cadence.
 * `deemed_agreement_enabled` is restored to false after each test.
 */

let a: TestUser, aRec: TestUser, b: TestUser, bMgr: TestUser, bRec: TestUser, c: TestUser, platform: TestUser, b2: TestUser;
let orgA: { id: string }, orgB: { id: string }, orgC: { id: string }, orgB2: { id: string };
const uniq = () => randomUUID().slice(0, 8);
const one = (q: string) => sql(q)[0];
const referral = async (id: string) => (await admin().from("referrals").select("*").eq("id", id).single()).data!;
const replica = (q: string) => sql(`set session_replication_role = replica; ${q}`);
const today = () => one(`select (now() at time zone 'America/Toronto')::date::text`);
const daysAgo = (n: number) => one(`select ((now() at time zone 'America/Toronto')::date - ${n})::text`);
const month = () => one(`select to_char(now() at time zone 'America/Toronto', 'YYYY-MM-01')`);
const flag = (on: boolean) => sql(`update app.platform_settings set value = '${on}'::jsonb where key = 'deemed_agreement_enabled'`);
const status = (rid: string) => one(`select status from app.hire_reports where id = '${rid}'`);
const reportId = (referralId: string) => one(`select id from app.hire_reports where referral_id = '${referralId}' order by filed_at desc limit 1`);
const notesSince = (userId: string, since: string, kindLike = "%") =>
  sql(`select kind || ' :: ' || title || ' :: ' || body from public.notifications where user_id = '${userId}' and kind like '${kindLike}' and created_at >= '${since}'`);
const errShape = (e: { message?: string; code?: string; details?: string | null; hint?: string | null } | null) =>
  JSON.stringify({ message: e?.message ?? null, code: e?.code ?? null, details: e?.details ?? null, hint: e?.hint ?? null });

beforeAll(async () => {
  [a, aRec, b, bMgr, bRec, c, platform, b2] = await Promise.all([
    createUser("n3qa-a"), createUser("n3qa-arec"), createUser("n3qa-b"), createUser("n3qa-bmgr"), createUser("n3qa-brec"), createUser("n3qa-c"),
    createUser("n3qa-admin", { platformAdmin: true }), createUser("n3qa-b2"),
  ]);
  orgA = await createOrg(a, "N3QA Agency A");
  orgB = await createOrg(b, "N3QA Hiring B");
  orgC = await createOrg(c, "N3QA Other C");
  orgB2 = await createOrg(b2, "N3QA Hiring B2");
  for (const [org, u, role] of [[orgB, bMgr, "recruiter_manager"], [orgB, bRec, "recruiter"], [orgA, aRec, "recruiter"]] as const) {
    const { error } = await admin().from("organization_memberships").insert({ organization_id: org.id, user_id: u.id, role, status: "active" });
    if (error) throw error;
  }
});
beforeEach(() => {
  const ids = [a, aRec, b, bMgr, bRec, c, platform, b2].map((u) => `'${u.id}'`).join(", ");
  sql(`delete from app.rate_limits where user_id in (${ids})`);
  // Keep org A under its BR-20 limits across this file (a dedicated test covers them on a fresh org).
  if (orgA) sql(`update app.hire_reports set status = case when status in ('awaiting_answer', 'unanswered', 'contested', 'in_review') then 'void' else status end,
                 filed_at = filed_at - interval '100 days' where source_org_id = '${orgA.id}'`);
});
afterEach(() => flag(false));

async function referred(opts: { clientName?: string; src?: TestUser; srcOrg?: string; tgt?: TestUser; tgtOrg?: string } = {}) {
  const { clientName = `Client ${uniq()}`, src = a, srcOrg = orgA.id, tgt = b, tgtOrg = orgB.id } = opts;
  const job = await createJob(tgt, tgtOrg, { title: `N3QA ${uniq()}`, client_name: clientName, accepts_external_referrals: false });
  await publishTerms(tgt, job);
  const cand = await createCandidate(src, srcOrg, { email: `n3qa-${uniq()}@example.com` });
  const consent = await sharingConsent(src, srcOrg, cand, job);
  const { data, error } = await src.client.rpc("submit_referral", {
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
const item = (over: Partial<Item> = {}): Item => ({ type: "profile_change", item_date: daysAgo(2), url: "https://example.com/qa-profile-link", ...over });
const file = (referralId: string, over: Record<string, unknown> = {}, u: TestUser = a, org = orgA.id) =>
  asError(u.client.rpc("file_hire_report", {
    p_referral: referralId, p_acting_org: org, p_employer: "Qaemployer Analytics", p_start_month: month(), p_role: "Data analyst",
    p_learned_via: "profile", p_statement: "QA statement: the candidate's public profile shows the new role.", p_tail_statement: false,
    p_items: [item()], p_file_ids: [], p_attested: true, ...over,
  } as never));
const contest = (rid: string, over: Record<string, unknown> = {}, u: TestUser = b, org = orgB.id) =>
  asError(u.client.rpc("contest_hire_report", { p_report: rid, p_acting_org: org, p_reason: "not_hired",
    p_statement: "The client confirmed in writing that nobody was hired.", p_offer_accepted_on: null, p_process_started_on: null, p_file_ids: [], p_attested: true, ...over } as never));
const rebut = (rid: string, over: Record<string, unknown> = {}, u: TestUser = a, org = orgA.id) =>
  asError(u.client.rpc("rebut_hire_report", { p_report: rid, p_acting_org: org, p_statement: "QA rebuttal: the company announcement names the candidate.",
    p_items: [item({ type: "company_announcement", url: "https://example.com/qa-rebuttal-link" })], p_file_ids: [], p_attested: true, ...over } as never));
const decide = (rid: string, outcome: string, finding: string | null = null, resolution = "Decided on the record after reviewing both sides.") =>
  platform.client.rpc("admin_decide_hire_report", { p_report: rid, p_outcome: outcome, p_resolution: resolution, p_finding: finding } as never);
const sweep = () => admin().rpc("run_hire_maintenance");
const hire = async (referralId: string, args: Record<string, unknown> = {}, u: TestUser = b) =>
  u.client.rpc("report_hire", { p_referral: referralId, p_start_date: today(), p_expected_version: (await referral(referralId)).version,
    p_terms_version: effectiveTerms(referralId), p_base_minor: 10_000_000, ...args } as never);
const pdfBytes = () => new TextEncoder().encode(`%PDF-1.4\n% ${randomUUID()}\n%%EOF\n`);
async function upload(referralId: string, u: TestUser, org: string, bytes: Uint8Array = pdfBytes(), contentType = "application/pdf", ext = "pdf") {
  const path = `${org}/${referralId}/${randomUUID()}.${ext}`;
  const up = await u.client.storage.from("hire-evidence").upload(path, bytes, { contentType });
  return { path, error: up.error };
}
const register = (referralId: string, kind: string, path: string, u: TestUser, org: string) =>
  u.client.rpc("register_hire_evidence", { p_referral: referralId, p_owner_kind: kind, p_storage_path: path, p_file_name: "qa-proof.pdf", p_acting_org: org });
async function evidence(referralId: string, kind: string, u: TestUser, org: string, clean = true) {
  const bytes = pdfBytes();
  const { path, error } = await upload(referralId, u, org, bytes);
  if (error) throw new Error(error.message);
  const { data, error: rErr } = await register(referralId, kind, path, u, org);
  if (rErr) throw new Error(rErr.message);
  const id = (data as { id: string }).id;
  if (clean) {
    const r = await admin().rpc("record_hire_evidence_scan", { p_file: id, p_verdict: "clean", p_sha256: createHash("sha256").update(bytes).digest("hex") });
    if (r.error) throw new Error(r.error.message);
  }
  return id;
}
/** A fee-pending placement established as `upheld` on an accepted + confirmed referral. */
async function feePending() {
  const r = await referred();
  await withAgreement(r.referralId);
  const pid = one(`select app.establish_hire('${r.referralId}', 'upheld')`);
  return { ...r, pid };
}
const pVersion = (pid: string) => Number(one(`select version from public.placements where id = '${pid}'`));
const fee = async (pid: string, args: Record<string, unknown> = {}, u: TestUser = b) =>
  u.client.rpc("complete_fee_details", { p_placement: pid, p_expected_version: pVersion(pid), p_start_date: today(),
    p_terms_version: effectiveTerms(one(`select referral_id from public.placements where id = '${pid}'`)), p_base_minor: 10_000_000, ...args } as never);

// =============================================================================================
describe("QA-1 generic refusal: one code, one payload, no oracle (BR-17, AC-35, AC-36, R-2)", () => {
  it("every refusal cause returns a byte-identical error object; outsiders never get hire_already_recorded", async () => {
    const shapes: Record<string, string> = {};
    // v2.1 (QA-N3-02): refused attempts now count toward the 5/h per-user bucket; this test makes more than 5.
    const clearLimits = () => sql(`delete from app.rate_limits where user_id in ('${a.id}', '${c.id}', '${aRec.id}')`);
    // QA round 1: compare the RAW PostgREST response too (status, data, error), not only the asError-normalised
    // object, so a raise-vs-result difference between causes (HTTP 400 vs 200) would show up as an oracle.
    const raw: Record<string, string> = {};
    const take = async (label: string, referralId: string, u: TestUser = a, org = orgA.id) => {
      clearLimits();
      const args = { p_referral: referralId, p_acting_org: org, p_employer: "Qaemployer Analytics", p_start_month: month(), p_role: "Data analyst",
        p_learned_via: "profile", p_statement: "QA statement: the candidate's public profile shows the new role.", p_tail_statement: false,
        p_items: [item()], p_file_ids: [], p_attested: true };
      const res = await u.client.rpc("file_hire_report", args as never);
      raw[label] = JSON.stringify({ status: res.status, data: res.data, error: res.error });
      clearLimits();
      const r = await file(referralId, {}, u, org);
      expect(r.data, label).toBeNull();
      shapes[label] = errShape(r.error);
    };
    const pending = await referred();
    expect((await file(pending.referralId)).error).toBeNull();
    await take("pending report", pending.referralId);

    const rel = await referred();
    await move(rel.referralId, "declined");
    expect((await a.client.rpc("release_referral", { p_referral: rel.referralId, p_acting_org: orgA.id })).error).toBeNull();
    await take("released", rel.referralId);

    const old = await referred();
    await move(old.referralId, "declined");
    replica(`update public.referrals set delivered_at = now() - interval '17 months', ownership_protected_until = now() - interval '10 months' where id = '${old.referralId}'`);
    await take("out of tail", old.referralId);

    const twice = await referred();
    sql(`insert into app.hire_reports (referral_id, source_org_id, target_org_id, filed_by, status, employer_text, start_month, learned_via, statement, attested_at, answer_due_at, resolved_at, resolution, finding)
         select r.id, r.source_org_id, r.target_org_id, '${a.id}', 'rejected', 'X', date_trunc('month', now())::date, 'other', 'Seeded rejected report for QA.', now(), now(), now() - interval '5 days', 'Seeded resolution text for QA purposes.', 'not_hired'
           from public.referrals r, generate_series(1, 2) where r.id = '${twice.referralId}'`);
    await take("two rejections", twice.referralId);

    const second = await referred();
    sql(`insert into app.hire_reports (referral_id, source_org_id, target_org_id, filed_by, status, employer_text, start_month, learned_via, statement, attested_at, answer_due_at, resolved_at, resolution, finding)
         select r.id, r.source_org_id, r.target_org_id, '${a.id}', 'rejected', 'X', date_trunc('month', now())::date, 'other', 'Seeded rejected report for QA.', now(), now(), now(), 'Seeded resolution text for QA purposes.', 'not_hired'
           from public.referrals r where r.id = '${second.referralId}'`);
    await take("second report without newer item", second.referralId); // item dated 2 days ago, rejection today

    const recorded = await referred();
    await withAgreement(recorded.referralId);
    expect((await hire(recorded.referralId)).error).toBeNull();
    clearLimits();
    expect((await file(recorded.referralId)).error?.message).toMatch(/^hire_already_recorded/);
    await take("recorded hire, other org (C)", recorded.referralId, c, orgC.id);
    await take("recorded hire, C claiming A's org id", recorded.referralId, c, orgA.id);
    await take("recorded hire, A recruiter outside record scope", recorded.referralId, aRec, orgA.id);
    await take("recorded hire, hiring side", recorded.referralId, b, orgB.id);
    await take("random uuid", randomUUID());
    await take("pending, other org", pending.referralId, c, orgC.id);

    const distinct = new Set(Object.values(shapes));
    expect(distinct.size, JSON.stringify(shapes, null, 1)).toBe(1);
    expect([...distinct][0]).toMatch(/"message":"hire_report_unavailable"/);
    const rawDistinct = new Set(Object.values(raw));
    expect(rawDistinct.size, JSON.stringify(raw, null, 1)).toBe(1);
    expect([...rawDistinct][0]).toBe(JSON.stringify({ status: 200, data: { error: "hire_report_unavailable" }, error: null }));
  });
});

// =============================================================================================
describe("QA-2 rate limits (BR-20, AC-37)", () => {
  it("10 filed in a rolling 90 days → hire_report_rate_limited on the 11th; allowed again once they age past 90 days", async () => {
    const u = await createUser("n3qa-lim90");
    const orgL = await createOrg(u, "N3QA Limits 90");
    const first = await referred({ src: u, srcOrg: orgL.id });
    const target = await referred({ src: u, srcOrg: orgL.id });
    // 10 closed (non-pending) reports filed 80 days ago on the first referral.
    sql(`insert into app.hire_reports (referral_id, source_org_id, target_org_id, filed_by, filed_at, status, employer_text, start_month, learned_via, statement, attested_at, answer_due_at, resolved_at)
         select r.id, r.source_org_id, r.target_org_id, '${u.id}', now() - interval '80 days', 'confirmed', 'X', date_trunc('month', now())::date, 'other', 'Seeded confirmed report for QA.', now(), now(), now()
           from public.referrals r, generate_series(1, 10) where r.id = '${first.referralId}'`);
    expect((await file(target.referralId, {}, u, orgL.id)).error?.message).toMatch(/^hire_report_rate_limited/);
    sql(`update app.hire_reports set filed_at = now() - interval '91 days' where referral_id = '${first.referralId}'`);
    expect((await file(target.referralId, {}, u, orgL.id)).error).toBeNull();
  });

  it("per user: the 6th filing attempt in an hour gets rate_limited (N1 disputes bucket, 5/h), distinct from the generic code", async () => {
    const codes: string[] = [];
    for (let i = 0; i < 6; i++) codes.push((await file(randomUUID())).error?.message ?? "ok");
    expect(codes.slice(0, 5).every((m) => m.startsWith("hire_report_unavailable"))).toBe(true);
    expect(codes[5]).toMatch(/^rate_limited/);
  });

  it("QA round 1: refused attempts count on all four RPCs (file, contest, rebut, request_authorization_check); the 6th is rate_limited", async () => {
    const reset = () => sql(`delete from app.rate_limits where user_id in ('${a.id}', '${b.id}')`);
    const r = await referred();
    expect((await file(r.referralId)).error).toBeNull();
    const rid = reportId(r.referralId);
    const six = async (label: string, call: () => PromiseLike<{ error: { message: string } | null }>, refusal: RegExp) => {
      reset();
      const codes: string[] = [];
      for (let i = 0; i < 6; i++) codes.push((await call()).error?.message ?? "ok");
      expect(codes.slice(0, 5).every((m) => refusal.test(m)), `${label}: ${codes.join(",")}`).toBe(true);
      expect(codes[5], label).toMatch(/^rate_limited/);
    };
    // B: request an auth check while the report isn't contested → auth_check_not_available (a counted refusal).
    await six("request_authorization_check", () => asError(b.client.rpc("request_authorization_check", { p_referral: r.referralId, p_acting_org: orgB.id,
      p_reason: "QA: we doubt the candidate agreed to this.", p_file_ids: [] })), /^auth_check_not_available/);
    // A: rebut before any contest → hire_rebuttal_closed.
    await six("rebut_hire_report", () => rebut(rid), /^hire_rebuttal_closed/);
    // B: contest after the answer deadline → hire_report_answer_closed.
    sql(`update app.hire_reports set answer_due_at = now() - interval '1 minute' where id = '${rid}'`);
    await six("contest_hire_report", () => contest(rid), /^hire_report_answer_closed/);
    // A: file on the same referral (pending report) → hire_report_unavailable.
    await six("file_hire_report", () => file(r.referralId), /^hire_report_unavailable/);
    reset();
    expect(status(rid)).toBe("awaiting_answer");
  });
});

// =============================================================================================
describe("QA-3 evidence bucket, purposes and links (BR-18, BR-19, AC-42, AC-44, AC-45, AC-55)", () => {
  it("bucket is private with the 10 MB / PDF-PNG-JPEG limits, and no read policy exists for members", () => {
    expect(one(`select public::text || '|' || file_size_limit || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'hire-evidence'`))
      .toBe("false|10485760|application/pdf,image/png,image/jpeg");
    expect(one(`select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL')
                  and coalesce(qual, '') || coalesce(with_check, '') like '%hire-evidence%'`)).toBe("0");
  });

  it("storage refuses other types and oversize files; register refuses mismatched type, foreign paths, other users' objects and a 6th draft", async () => {
    const { referralId } = await referred();
    expect((await upload(referralId, a, orgA.id, new TextEncoder().encode("<html><script>alert(1)</script></html>"), "text/html", "pdf")).error).not.toBeNull();
    expect((await upload(referralId, a, orgA.id, new Uint8Array(10 * 1024 * 1024 + 1), "application/pdf")).error).not.toBeNull();
    // A PDF object registered under a .png name is refused (extension ↔ stored type).
    const png = await upload(referralId, a, orgA.id, pdfBytes(), "application/pdf", "png");
    if (!png.error) expect((await register(referralId, "hire_report", png.path, a, orgA.id)).error?.message).toMatch(/^hire_evidence_invalid/);
    // Another member of A uploads; A can't register that object as its own.
    const someone = await createUser("n3qa-a-other");
    await admin().from("organization_memberships").insert({ organization_id: orgA.id, user_id: someone.id, role: "org_admin", status: "active" });
    const theirs = await upload(referralId, someone, orgA.id);
    expect(theirs.error).toBeNull();
    expect((await register(referralId, "hire_report", theirs.path, a, orgA.id)).error?.message).toMatch(/^hire_evidence_invalid/);
    // Path under another referral / another org prefix.
    const other = await referred();
    const elsewhere = await upload(other.referralId, a, orgA.id);
    expect((await register(referralId, "hire_report", elsewhere.path, a, orgA.id)).error?.message).toMatch(/^hire_evidence_invalid/);
    // Wrong purpose for the side.
    const mine = await upload(referralId, a, orgA.id);
    expect((await register(referralId, "hire_contest", mine.path, a, orgA.id)).error?.message).toMatch(/^not_found/);
    expect((await register(referralId, "auth_request", mine.path, a, orgA.id)).error?.message).toMatch(/^not_found/);
    // 5 drafts max.
    for (let i = 0; i < 5; i++) await evidence(referralId, "hire_report", a, orgA.id, false);
    const sixth = await upload(referralId, a, orgA.id);
    expect((await register(referralId, "hire_report", sixth.path, a, orgA.id)).error?.message).toMatch(/^hire_evidence_too_many/);
  });

  it("members can't download or sign objects directly; unclean files aren't authorized; downloads are audited per side", async () => {
    const { referralId } = await referred();
    const bytes = pdfBytes();
    const { path } = await upload(referralId, a, orgA.id, bytes);
    const reg = await register(referralId, "hire_report", path, a, orgA.id);
    expect(reg.error).toBeNull();
    const fid = (reg.data as { id: string }).id;
    expect((await a.client.storage.from("hire-evidence").download(path)).error).not.toBeNull();
    expect((await a.client.storage.from("hire-evidence").createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await b.client.storage.from("hire-evidence").createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await a.client.rpc("authorize_hire_evidence", { p_file: fid, p_acting_org: orgA.id })).error?.message).toMatch(/^hire_report_files_not_ready/);
    expect((await platform.client.rpc("authorize_hire_evidence", { p_file: fid })).error?.message).toMatch(/^hire_report_files_not_ready/);
    await admin().rpc("record_hire_evidence_scan", { p_file: fid, p_verdict: "clean", p_sha256: createHash("sha256").update(bytes).digest("hex") });
    expect((await a.client.rpc("authorize_hire_evidence", { p_file: fid, p_acting_org: orgA.id })).data).toBe(path);
    expect((await aRec.client.rpc("authorize_hire_evidence", { p_file: fid, p_acting_org: orgA.id })).error?.message).toMatch(/^not_found/);
    expect((await c.client.rpc("authorize_hire_evidence", { p_file: fid, p_acting_org: orgA.id })).error?.message).toMatch(/^not_found/);
    expect((await platform.client.rpc("authorize_hire_evidence", { p_file: fid })).data).toBe(path);
    expect(one(`select count(*) filter (where organization_id = '${orgA.id}') || '/' || count(*) filter (where organization_id is null)
                  from public.audit_events where action = 'hire_evidence.accessed' and entity_id = '${referralId}'`)).toBe("1/1");
  });

  it("the worker scan rejects a non-PDF disguised as PDF and hashes a real one (SHA-256 from the stored object)", async () => {
    const { referralId } = await referred();
    const fake = await upload(referralId, a, orgA.id, new TextEncoder().encode("MZ this is not a pdf at all"), "application/pdf");
    const fakeId = ((await register(referralId, "hire_report", fake.path, a, orgA.id)).data as { id: string }).id;
    const bytes = pdfBytes();
    const real = await upload(referralId, a, orgA.id, bytes);
    const realId = ((await register(referralId, "hire_report", real.path, a, orgA.id)).data as { id: string }).id;
    await scanHireEvidence(admin() as never, fakeId);
    await scanHireEvidence(admin() as never, realId);
    expect(one(`select scan_status || '|' || coalesce(sha256, '-') from app.hire_evidence_files where id = '${fakeId}'`)).toBe("rejected|-");
    expect(one(`select scan_status || '|' || sha256 from app.hire_evidence_files where id = '${realId}'`)).toBe(`clean|${createHash("sha256").update(bytes).digest("hex")}`);
    expect((await file(referralId, { p_file_ids: [fakeId] })).error?.message).toMatch(/^hire_report_files_not_ready/);
  });

  it("files of the wrong purpose, side or referral can't be attached; B never gets A's rebuttal links or file names; A never gets B's files for any reason", async () => {
    const r = await referred();
    const other = await referred();
    const otherFile = await evidence(other.referralId, "hire_report", a, orgA.id);
    expect((await file(r.referralId, { p_file_ids: [otherFile] })).error?.message).toMatch(/^hire_report_files_not_ready/);
    const bFile = await evidence(r.referralId, "hire_contest", b, orgB.id);
    expect((await file(r.referralId, { p_file_ids: [bFile] })).error?.message).toMatch(/^hire_report_files_not_ready/);
    const dup = await evidence(r.referralId, "hire_report", a, orgA.id);
    expect((await file(r.referralId, { p_file_ids: [dup, dup] })).error?.message).toMatch(/^hire_report_files_not_ready/);
    expect((await file(r.referralId, { p_file_ids: [dup] })).error).toBeNull();
    const rid = reportId(r.referralId);
    // Removing a filed file, or someone else's draft, is not found.
    expect((await a.client.rpc("remove_hire_evidence", { p_file: dup, p_acting_org: orgA.id })).error?.message).toMatch(/^not_found/);
    expect((await a.client.rpc("remove_hire_evidence", { p_file: bFile, p_acting_org: orgA.id })).error?.message).toMatch(/^not_found/);
    expect((await contest(rid, { p_reason: "not_hired", p_file_ids: [bFile] })).error).toBeNull();
    const rebFile = await evidence(r.referralId, "hire_rebuttal", a, orgA.id);
    expect((await rebut(rid, { p_file_ids: [rebFile] })).error).toBeNull();
    const bRaw = (await b.client.rpc("get_hire_reports", { p_referral: r.referralId, p_acting_org: orgB.id })).data as Record<string, unknown>[];
    const bView = JSON.stringify(bRaw);
    // B's own contest files are B's (full view); everything of A's (report items/files, rebuttal) is reduced.
    const aParts = JSON.stringify([bRaw[0].items, bRaw[0].files, bRaw[0].rebuttal]);
    expect(aParts).not.toMatch(/qa-rebuttal-link|qa-profile-link|qa-proof|storage_path|"url"|"file_name"|"mime_type"|"id"/);
    expect(bView).not.toMatch(/qa-rebuttal-link|qa-profile-link|storage_path/);
    expect(bView).not.toContain(dup);
    expect(bView).not.toContain(rebFile);
    const aView = (await a.client.rpc("get_hire_reports", { p_referral: r.referralId, p_acting_org: orgA.id })).data as { contest: { files: unknown[]; statement: string | null } }[];
    expect(aView[0].contest.files).toEqual([]);
    expect(aView[0].contest.statement).toMatch(/nobody was hired/); // not_hired: A sees B's statement (BR-25)
    expect(JSON.stringify(aView)).not.toContain(bFile);
    expect((await a.client.rpc("authorize_hire_evidence", { p_file: bFile, p_acting_org: orgA.id })).error?.message).toMatch(/^not_found/);
    expect((await b.client.rpc("authorize_hire_evidence", { p_file: rebFile, p_acting_org: orgB.id })).error?.message).toMatch(/^not_found/);
  });
});

// =============================================================================================
describe("QA-4 not_this_client and client-name leakage to A (BR-19, BR-25, rule 4.5, AC-45, AC-46, AC-55)", () => {
  it("A never receives the client name or key, B's statement or the resolution on not_this_client, anywhere", async () => {
    const client = `Zyxwvut Secret Client ${uniq()}`;
    const key = one(`select app.client_key('${client}')`);
    const since = dbNow();
    const { referralId, cand } = await referred({ clientName: client });
    expect((await file(referralId)).error).toBeNull();
    const rid = reportId(referralId);
    const bStatement = `The candidate joined a competitor of ${client}, not this client.`;
    expect((await contest(rid, { p_reason: "not_this_client", p_statement: bStatement })).error).toBeNull();
    expect((await rebut(rid)).error).toBeNull();
    expect((await decide(rid, "rejected", "not_this_client", `Finding: the hire was not at ${client}; the employer differs.`)).error).toBeNull();

    const aPayloads = JSON.stringify([
      (await a.client.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: orgA.id })).data,
      (await a.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgA.id })).data,
      (await a.client.rpc("get_referral_presentation", { p_referral: referralId, p_acting_org: orgA.id })).data,
      (await a.client.from("referrals").select("*").eq("id", referralId)).data,
      (await a.client.from("disputes").select("*").eq("referral_id", referralId)).data,
      (await a.client.from("hire_records").select("*").eq("referral_id", referralId)).data,
      notesSince(a.id, since),
      (await a.client.from("audit_events").select("action, metadata").eq("organization_id", orgA.id).gte("created_at", since)).data,
    ]);
    expect(aPayloads).not.toContain(client);
    expect(aPayloads).not.toContain(key);
    expect(aPayloads).not.toContain("competitor of");
    expect(aPayloads).not.toContain("Finding: the hire");
    const aReport = ((await a.client.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: orgA.id })).data as Record<string, unknown>[])[0];
    expect(aReport).toMatchObject({ status: "rejected", not_this_client: true, resolution: null });
    expect((aReport.contest as Record<string, unknown>).statement).toBeNull();
    // B: candidate ids never reach the hiring side through the N3 reads.
    const bPayloads = JSON.stringify([
      (await b.client.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: orgB.id })).data,
      (await b.client.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: orgB.id })).data,
      notesSince(b.id, since),
    ]);
    expect(bPayloads).not.toContain(cand);
    expect(bPayloads).toContain("competitor of"); // B keeps its own statement
  });

  it("XSS payloads in statements are stored and returned verbatim as text (rendering is checked in E2E)", async () => {
    const { referralId } = await referred();
    const xss = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script> QA statement long enough.`;
    expect((await file(referralId, { p_statement: xss, p_employer: `<b onmouseover=alert(1)>Emp</b>` })).error).toBeNull();
    const view = (await b.client.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: orgB.id })).data as { statement: string; employer_text: string }[];
    expect(view[0].statement).toBe(xss);
    // javascript: and data: links are refused at the RPC and the table.
    for (const url of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", " https://x.com", "HTTPS://x.com", "http://x.com"]) {
      const r2 = await referred();
      expect((await file(r2.referralId, { p_items: [item({ url })] })).error?.message, url).toMatch(/^hire_report_invalid/);
    }
  });
});

// =============================================================================================
describe("QA-5 money and date bounds on complete_fee_details and report_hire (BR-32, AC-72, PD-077, AC-16)", () => {
  it("complete_fee_details refuses every out-of-bound money input and writes nothing", async () => {
    const { pid } = await feePending();
    const T = 1_000_000_000_000; // 10^12
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ p_base_minor: 0 }, /^hire_base_invalid/],
      [{ p_base_minor: -1 }, /^hire_base_invalid/],
      [{ p_base_minor: T + 1 }, /^hire_base_invalid/],
      [{ p_base_minor: "9223372036854775807" }, /^(hire_base_invalid|invalid_fee)/],
      [{ p_bonus_minor: -1 }, /^hire_base_invalid/],
      [{ p_bonus_minor: T + 1 }, /^hire_base_invalid/],
      [{ p_base_minor: null }, /^hire_base_invalid/],
      [{ p_invoiced_fee_minor: 0, p_difference_reason: "client_discount" }, /^(hire_base_invalid|invalid_fee)/],
      [{ p_invoiced_fee_minor: -5, p_difference_reason: "client_discount" }, /^(hire_base_invalid|invalid_fee)/],
      [{ p_invoiced_fee_minor: 19_999, p_difference_reason: "client_discount" }, /^(hire_base_invalid|invalid_fee)/],          // < ceil(C/100), C = 2,000,000
      [{ p_invoiced_fee_minor: 200_000_001, p_difference_reason: "client_discount" }, /^(hire_base_invalid|invalid_fee)/],     // > 100·C
      [{ p_invoiced_fee_minor: T + 1, p_difference_reason: "client_discount" }, /^(hire_base_invalid|invalid_fee)/],
      [{ p_invoiced_fee_minor: 1_500_000 }, /^fee_difference_reason_required/],
      [{ p_invoiced_fee_minor: 1_500_000, p_difference_reason: "bribe" }, /./],
      [{ p_legacy_fee_minor: 5_000_000, p_legacy_currency: "CAD" }, /./], // legacy args on a snapshot referral
    ];
    for (const [over, re] of cases) {
      const r = await fee(pid, over);
      expect(r.error?.message ?? "accepted", JSON.stringify(over)).toMatch(re);
      expect(r.error, JSON.stringify(over)).not.toBeNull();
    }
    // Non-integer money never reaches the function (bigint cast).
    expect((await fee(pid, { p_base_minor: 1500.5 })).error).not.toBeNull();
    expect(one(`select status || '|' || coalesce(contracted_fee_minor::text, 'null') || '|' || coalesce(reported_base_minor::text, 'null') from public.placements where id = '${pid}'`)).toBe("fee_pending|null|null");
    // The table refuses out-of-bound values on any path (service role included).
    expect(() => sql(`update public.placements set reported_base_minor = ${T + 1} where id = '${pid}'`)).toThrow();
    expect(() => sql(`update public.placements set contracted_fee_minor = -1 where id = '${pid}'`)).toThrow();
    // Bounds hold on success: exactly 10^12 base is accepted.
    expect((await fee(pid, { p_base_minor: T })).error).toBeNull();
  });

  it("pct_total_cash fee-pending: bonus bounds (≥ 0, ≤ 10^12) and base bounds at the RPC", async () => {
    const job = await createJob(b, orgB.id, { title: `N3QA TC ${uniq()}`, client_name: `Client ${uniq()}`, accepts_external_referrals: false });
    await publishTerms(b, job, { p_fee_basis: "pct_total_cash" } as never);
    const cand = await createCandidate(a, orgA.id, { email: `n3qa-tc-${uniq()}@example.com` });
    const consent = await sharingConsent(a, orgA.id, cand, job);
    const { data } = await a.client.rpc("submit_referral", { p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline"],
      p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID() }).single();
    const referralId = data!.referral_id!;
    await withAgreement(referralId);
    const pid = one(`select app.establish_hire('${referralId}', 'upheld')`);
    const T = 1_000_000_000_000;
    for (const over of [{ p_bonus_minor: -1 }, { p_bonus_minor: T + 1 }, { p_bonus_minor: null }, { p_base_minor: T + 1, p_bonus_minor: 0 }, { p_base_minor: 0, p_bonus_minor: 0 }]) {
      expect((await fee(pid, over)).error?.message, JSON.stringify(over)).toMatch(/^hire_base_invalid/);
    }
    expect((await fee(pid, { p_base_minor: 10_000_000, p_bonus_minor: T })).error).toBeNull();
  });

  it("legacy fee-pending: free entry bounded (> 0, ≤ 10^12, real currency)", async () => {
    const r = await referred();
    await withAgreement(r.referralId);
    replica(`update public.referrals set terms_version_id = null, commission_rule_id = null, fee_estimate_minor = null where id = '${r.referralId}'`);
    const pid = one(`select app.establish_hire('${r.referralId}', 'upheld')`);
    const legacy = (over: Record<string, unknown>) => fee(pid, { p_terms_version: null, p_base_minor: null, p_legacy_currency: "CAD", p_legacy_guarantee_days: 90, ...over });
    for (const over of [{ p_legacy_fee_minor: 0 }, { p_legacy_fee_minor: -1 }, { p_legacy_fee_minor: 1_000_000_000_001 }, { p_legacy_fee_minor: 5_000_000, p_legacy_currency: "cad" },
      { p_legacy_fee_minor: 5_000_000, p_legacy_currency: null }]) {
      expect((await legacy(over)).error, JSON.stringify(over)).not.toBeNull();
    }
    expect((await legacy({ p_legacy_fee_minor: 5_000_000 })).error).toBeNull();
  });

  it("PD-077 window on complete_fee_details: floor accepted, floor − 1 and today + 549 refused, null refused", async () => {
    const p1 = await feePending();
    const floor = one(`select ((delivered_at at time zone 'America/Toronto')::date - interval '1 year')::date::text from public.referrals where id = '${p1.referralId}'`);
    for (const d of [one(`select ('${floor}'::date - 1)::text`), one(`select ((now() at time zone 'America/Toronto')::date + 549)::text`), null]) {
      expect((await fee(p1.pid, { p_start_date: d })).error?.message, String(d)).toMatch(/^hire_dates_invalid/);
    }
    expect((await fee(p1.pid, { p_start_date: floor })).error).toBeNull();
    const p2 = await feePending();
    expect((await fee(p2.pid, { p_start_date: one(`select ((now() at time zone 'America/Toronto')::date + 548)::text`) })).error).toBeNull();
  });

  it("report_hire money bounds hold on V2 (non-offer), V3 (deemed) and the Confirm path", async () => {
    const T = 1_000_000_000_000;
    const v2 = await referred();
    await withAgreement(v2.referralId);
    await move(v2.referralId, "interviewing");
    for (const over of [{ p_base_minor: T + 1 }, { p_base_minor: -1 }, { p_bonus_minor: -1 }, { p_invoiced_fee_minor: T + 1, p_difference_reason: "client_discount" }]) {
      expect((await hire(v2.referralId, over)).error, `V2 ${JSON.stringify(over)}`).not.toBeNull();
    }
    flag(true);
    const v3 = await referred();
    for (const over of [{ p_base_minor: T + 1 }, { p_base_minor: 0 }]) expect((await hire(v3.referralId, over)).error, `V3 ${JSON.stringify(over)}`).not.toBeNull();
    expect(one(`select count(*) from public.collaboration_agreements where referral_id = '${v3.referralId}'`)).toBe("0");
    const conf = await referred();
    await withAgreement(conf.referralId);
    expect((await file(conf.referralId)).error).toBeNull();
    const rid = reportId(conf.referralId);
    expect((await hire(conf.referralId, { p_report: rid, p_base_minor: T + 1 })).error).not.toBeNull();
    expect(status(rid)).toBe("awaiting_answer");
    expect(one(`select count(*) from public.placements where referral_id in ('${v2.referralId}', '${v3.referralId}', '${conf.referralId}')`)).toBe("0");
  });
});

// =============================================================================================
describe("QA-6 IDOR, roles and anon across every new RPC (AC-14, AC-96, §7)", () => {
  it("other orgs, wrong acting org, out-of-scope recruiters and admins-only RPCs answer not_found with no detail; anon is refused", async () => {
    flag(false);
    const r = await referred();
    await withAgreement(r.referralId);
    expect((await file(r.referralId)).error).toBeNull();
    const rid = reportId(r.referralId);
    expect((await contest(rid)).error).toBeNull();
    const bFile = await evidence(r.referralId, "auth_request", b, orgB.id);
    const aDraft = await evidence(r.referralId, "hire_rebuttal", a, orgA.id);
    const fp = await feePending();
    const check = (await platform.client.rpc("admin_open_authorization_check", { p_referral: r.referralId, p_requested_by: "candidate", p_challenger_evidence: true })).data as { id: string };

    type Call = [string, (u: TestUser, org: string) => PromiseLike<{ error: { message: string; details?: string | null; hint?: string | null } | null }>];
    const memberCalls: Call[] = [
      ["contest_hire_report", (u, org) => contest(rid, {}, u, org)],
      ["rebut_hire_report", (u, org) => rebut(rid, {}, u, org)],
      ["get_hire_reports", (u, org) => u.client.rpc("get_hire_reports", { p_referral: r.referralId, p_acting_org: org })],
      ["get_referral_hire_state", (u, org) => u.client.rpc("get_referral_hire_state", { p_referral: r.referralId, p_acting_org: org })],
      ["list_hire_evidence_files(source)", (u, org) => u.client.rpc("list_hire_evidence_files", { p_referral: r.referralId, p_owner_kind: "hire_rebuttal", p_acting_org: org })],
      ["remove_hire_evidence", (u, org) => u.client.rpc("remove_hire_evidence", { p_file: aDraft, p_acting_org: org })],
      ["authorize_hire_evidence", (u, org) => u.client.rpc("authorize_hire_evidence", { p_file: bFile, p_acting_org: org })],
      ["request_authorization_check", (u, org) => asError(u.client.rpc("request_authorization_check", { p_referral: r.referralId, p_acting_org: org, p_reason: "QA forged request reason text.", p_file_ids: [] }))],
      ["submit_authorization_evidence", (u, org) => u.client.rpc("submit_authorization_evidence", { p_check: check.id, p_acting_org: org, p_statement: "QA forged evidence statement.", p_file_ids: [aDraft], p_attested: true })],
      ["report_hire", (u) => hire(r.referralId, {}, u)],
      ["complete_fee_details", (u) => fee(fp.pid, {}, u)],
      ["get_placement_fee_state", (u) => u.client.rpc("get_placement_fee_state", { p_placement: fp.pid })],
    ];
    const outsiders: [string, TestUser, string][] = [
      ["C as C", c, orgC.id], ["C claiming A", c, orgA.id], ["C claiming B", c, orgB.id], ["B2 as B2", b2, orgB2.id],
    ];
    const leaks: string[] = [];
    for (const [name, call] of memberCalls) {
      for (const [who, u, org] of outsiders) {
        const res = await call(u, org);
        const m = res.error?.message ?? "OK";
        if (!/^not_found$/.test(m) || res.error?.details || res.error?.hint) leaks.push(`${name} by ${who}: ${m} ${res.error?.details ?? ""}`);
      }
    }
    // Side confusion: B acting as A's org, A acting as B's org.
    for (const [name, call] of memberCalls.slice(0, 9)) {
      for (const [who, u, org] of [["B as A", b, orgA.id], ["A as B", a, orgB.id]] as const) {
        const m = (await call(u, org)).error?.message ?? "OK";
        if (!/^not_found/.test(m)) leaks.push(`${name} by ${who}: ${m}`);
      }
    }
    expect(leaks).toEqual([]);
    // Out-of-scope recruiters on each side.
    expect((await bRec.client.rpc("get_hire_reports", { p_referral: r.referralId, p_acting_org: orgB.id })).error?.message).toMatch(/^not_found/);
    expect((await contest(rid, {}, bRec)).error?.message).toMatch(/^not_found/);
    expect((await aRec.client.rpc("get_hire_reports", { p_referral: r.referralId, p_acting_org: orgA.id })).error?.message).toMatch(/^not_found/);
    expect((await rebut(rid, {}, aRec)).error?.message).toMatch(/^not_found/);
    expect((await fee(fp.pid, {}, bRec)).error?.message).toMatch(/^not_found/);
    expect((await fee(fp.pid, {}, a)).error?.message).toMatch(/^not_found/);
    // B's manager (not the job owner) can act for B (RD-036).
    expect((await bMgr.client.rpc("get_hire_reports", { p_referral: r.referralId, p_acting_org: orgB.id })).error).toBeNull();

    // Admin RPCs: every member gets not_found.
    const adminCalls: [string, Record<string, unknown>][] = [
      ["admin_list_hire_reports", {}], ["admin_hire_report_flags", {}], ["admin_get_hire_report", { p_report: rid }],
      ["admin_set_hire_report_fields", { p_report: rid, p_candidate_contacts: 0, p_client_confirmation: "requested", p_note: "" }],
      ["admin_decide_hire_report", { p_report: rid, p_outcome: "upheld", p_resolution: "x".repeat(30), p_finding: null }],
      ["admin_open_authorization_check", { p_referral: r.referralId, p_requested_by: "candidate", p_challenger_evidence: false }],
      ["admin_decide_authorization_check", { p_check: check.id, p_valid: false, p_resolution: "x".repeat(30), p_candidate_contacted: false }],
      ["admin_get_authorization_checks", { p_referral: r.referralId }], ["admin_get_hire_record", { p_referral: r.referralId }],
      ["admin_set_hire_record_note", { p_referral: r.referralId, p_note: "x" }], ["admin_list_hire_tasks", {}],
      ["admin_record_fee_notice", { p_placement: fp.pid, p_sent_on: today(), p_note: null }],
    ];
    const adminLeaks: string[] = [];
    for (const [fn, args] of adminCalls) for (const u of [a, b, bMgr, c]) {
      const m = (await u.client.rpc(fn as never, args as never)).error?.message ?? "OK";
      if (!/^not_found/.test(m)) adminLeaks.push(`${fn} by ${u.email}: ${m}`);
    }
    expect(adminLeaks).toEqual([]);
    expect(status(rid)).toBe("contested");
    expect(one(`select status from app.authorization_checks where id = '${check.id}'`)).toBe("open");

    // Anon: privilege denied on every N3 member and admin RPC.
    const anonOpen: string[] = [];
    for (const fn of ["file_hire_report", "contest_hire_report", "rebut_hire_report", "get_hire_reports", "register_hire_evidence", "list_hire_evidence_files",
      "remove_hire_evidence", "authorize_hire_evidence", "request_authorization_check", "submit_authorization_evidence", "report_hire", "complete_fee_details",
      "get_referral_hire_state", "get_placement_fee_state", ...adminCalls.map(([f]) => f), "run_hire_maintenance", "record_hire_evidence_scan", "hire_evidence_scan_target",
      "purge_orphan_hire_files", "record_candidate_request_delivery"]) {
      const { error } = await anon().rpc(fn as never, {} as never);
      if (!error || !/permission denied|Could not find|PGRST202/.test(`${error.message} ${error.code}`)) anonOpen.push(`${fn}: ${error?.message ?? "ok"}`);
    }
    expect(anonOpen).toEqual([]);
    // Members can't run the service-role RPCs.
    for (const fn of ["run_hire_maintenance", "record_hire_evidence_scan", "hire_evidence_scan_target", "purge_orphan_hire_files"]) {
      const { error } = await a.client.rpc(fn as never, (fn === "run_hire_maintenance" || fn === "purge_orphan_hire_files" ? {} : { p_file: aDraft, p_verdict: "clean", p_sha256: "a".repeat(64) }) as never);
      expect(error?.message ?? "ok", fn).toMatch(/permission denied|forbidden|Could not find/);
    }
  });

  it("every N3 function is SECURITY DEFINER with search_path = ''; new tables are closed; hire_records is SELECT-only for authenticated", () => {
    const bad = sql(`select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'app') and p.prokind = 'f'
         and p.proname in ('file_hire_report', 'contest_hire_report', 'rebut_hire_report', 'get_hire_reports', 'register_hire_evidence', 'list_hire_evidence_files',
           'remove_hire_evidence', 'authorize_hire_evidence', 'request_authorization_check', 'submit_authorization_evidence', 'report_hire', 'complete_fee_details',
           'get_referral_hire_state', 'get_placement_fee_state', 'admin_list_hire_reports', 'admin_hire_report_flags', 'admin_get_hire_report', 'admin_set_hire_report_fields',
           'admin_decide_hire_report', 'admin_open_authorization_check', 'admin_decide_authorization_check', 'admin_get_authorization_checks', 'admin_get_hire_record',
           'admin_set_hire_record_note', 'admin_list_hire_tasks', 'admin_record_fee_notice', 'run_hire_maintenance', 'record_hire_evidence_scan', 'hire_evidence_scan_target',
           'purge_orphan_hire_files', 'record_candidate_request_delivery', 'release_referral', 'hire_eligibility', 'establish_hire', 'hire_report_deemable', 'hire_side')
         and not (p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') ~ 'search_path=""')`);
    expect(bad).toEqual([]);
    expect(sql(`select privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'hire_records' and grantee = 'authenticated' order by 1`)).toEqual(["SELECT"]);
    expect(sql(`select privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'hire_records' and grantee = 'anon'`)).toEqual([]);
    expect(sql(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app'
                 and c.relname in ('hire_reports', 'hire_report_items', 'hire_evidence_files', 'auth_check_requests', 'authorization_checks', 'email_deliveries', 'platform_settings', 'hire_record_admin', 'placement_fee_notices')
                 and (not c.relrowsecurity or has_table_privilege('authenticated', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'SELECT'))`)).toEqual([]);
  });

  it("authenticated members can't insert, update or delete hire_records directly", async () => {
    const r = await referred();
    await withAgreement(r.referralId);
    expect((await hire(r.referralId)).error).toBeNull();
    const row = (await b.client.from("hire_records").select("id").eq("referral_id", r.referralId).single()).data!;
    expect((await b.client.from("hire_records").update({ hired_role_title: "Forged" } as never).eq("id", row.id)).error).not.toBeNull();
    expect((await b.client.from("hire_records").delete().eq("id", row.id)).error ?? { message: "no error" }).toBeTruthy();
    expect(one(`select count(*) from public.hire_records where id = '${row.id}'`)).toBe("1");
    expect((await c.client.from("hire_records").select("id").eq("referral_id", r.referralId)).data).toEqual([]);
    expect((await bRec.client.from("hire_records").select("id").eq("referral_id", r.referralId)).data).toEqual([]);
  });
});

// =============================================================================================
describe("QA-7 suspended parties and the job-owner-less hiring org (BR-29, BR-44 HE-10, HE-11, AC-93, AC-103)", () => {
  it("A suspended (N10 settlement mode): its pending report still moves to in_review at the rebuttal deadline; admin sees Suspended and decides", async () => {
    const u = await createUser("n3qa-asusp");
    const orgS = await createOrg(u, "N3QA Suspended A");
    const r = await referred({ src: u, srcOrg: orgS.id });
    expect((await file(r.referralId, {}, u, orgS.id)).error).toBeNull();
    const rid = reportId(r.referralId);
    expect((await contest(rid)).error).toBeNull();
    sql(`update public.organizations set suspended_at = now() where id = '${orgS.id}'`);
    try {
      // Observation: with N10 in the tree, a suspended org is in settlement mode and keeps BR-13 actions (N10 brief
      // BR-13 lists N3 hire reports), so spec AC-93's "A can't open the referral" no longer holds by design.
      expect(one(`select app.org_settlement_state('${orgS.id}')`)).toBe("settlement");
      sql(`update app.hire_reports set rebuttal_due_at = now() - interval '1 minute' where id = '${rid}'`);
      expect((await sweep()).error).toBeNull();
      expect(status(rid)).toBe("in_review");
      const { data: q } = await platform.client.rpc("admin_list_hire_reports");
      const row = (q ?? []).find((x: { id: string }) => x.id === rid) as Record<string, unknown> | undefined;
      expect(row).toBeTruthy();
      expect(JSON.stringify(row)).toMatch(/suspended":true/);
      expect((await decide(rid, "rejected", "not_hired")).error).toBeNull();
    } finally {
      sql(`update public.organizations set suspended_at = null where id = '${orgS.id}'`);
    }
  });

  it("B suspended at the answer deadline: unanswered even with two delivered records, no placement", async () => {
    flag(true);
    const u = await createUser("n3qa-bsusp");
    const orgS = await createOrg(u, "N3QA Suspended B");
    const mgr = await createUser("n3qa-bsusp-mgr");
    await admin().from("organization_memberships").insert({ organization_id: orgS.id, user_id: mgr.id, role: "org_admin", status: "active" });
    const r = await referred({ tgt: u, tgtOrg: orgS.id });
    expect((await file(r.referralId)).error).toBeNull();
    const rid = reportId(r.referralId);
    for (const who of [u.id, mgr.id]) sql(`insert into app.email_deliveries (notification_kind, entity_type, entity_id, recipient_user_id, provider_message_id, status)
                                           values ('hire_report.filed', 'hire_report', '${rid}', '${who}', '${randomUUID()}', 'delivered')`);
    sql(`update public.organizations set suspended_at = now() where id = '${orgS.id}'`);
    try {
      sql(`update app.hire_reports set answer_due_at = now() - interval '1 minute' where id = '${rid}'`);
      await sweep();
      expect(status(rid)).toBe("unanswered");
      expect(one(`select count(*) from public.placements where referral_id = '${r.referralId}'`)).toBe("0");
    } finally {
      sql(`update public.organizations set suspended_at = null where id = '${orgS.id}'`);
    }
    // Control: the same setup without the suspension is deemed.
    const r2 = await referred({ tgt: u, tgtOrg: orgS.id });
    expect((await file(r2.referralId)).error).toBeNull();
    const rid2 = reportId(r2.referralId);
    for (const who of [u.id, mgr.id]) sql(`insert into app.email_deliveries (notification_kind, entity_type, entity_id, recipient_user_id, provider_message_id, status)
                                           values ('hire_report.filed', 'hire_report', '${rid2}', '${who}', '${randomUUID()}', 'delivered')`);
    sql(`update app.hire_reports set answer_due_at = now() - interval '1 minute' where id = '${rid2}'`);
    await sweep();
    expect(status(rid2)).toBe("deemed_confirmed");
  });

  it("delivery records only for 'queued'/'sent' (not delivered) or for another notice kind never deem", async () => {
    const r = await referred();
    expect((await file(r.referralId)).error).toBeNull();
    const rid = reportId(r.referralId);
    const seed = (who: string, st: string, kind = "hire_report.filed") => sql(`insert into app.email_deliveries (notification_kind, entity_type, entity_id, recipient_user_id, provider_message_id, status)
                                                       values ('${kind}', 'hire_report', '${rid}', '${who}', '${randomUUID()}', '${st}')`);
    seed(b.id, "sent");
    seed(bMgr.id, "queued");
    seed(b.id, "delivered", "hire_report.reminder");
    seed(bMgr.id, "delivered", "hire_report.reminder");
    // A delivered record for a non-member of B (C) doesn't count as the second person.
    seed(b.id, "delivered");
    seed(c.id, "delivered");
    sql(`update app.hire_reports set answer_due_at = now() - interval '1 minute' where id = '${rid}'`);
    await sweep();
    expect(status(rid)).toBe("unanswered");
  });

  it("job owner who is a plain recruiter + one manager delivered → deemed; a plain B recruiter as the 2nd person doesn't count", async () => {
    flag(true);
    const r = await referred();
    expect((await file(r.referralId)).error).toBeNull();
    const rid = reportId(r.referralId);
    const seed = (who: string) => sql(`insert into app.email_deliveries (notification_kind, entity_type, entity_id, recipient_user_id, provider_message_id, status)
                                        values ('hire_report.filed', 'hire_report', '${rid}', '${who}', '${randomUUID()}', 'delivered')`);
    seed(b.id);
    seed(bRec.id); // recruiter, not admin/manager
    sql(`update app.hire_reports set answer_due_at = now() - interval '1 minute' where id = '${rid}'`);
    await sweep();
    expect(status(rid)).toBe("unanswered");
    // B can't contest after the deadline but can still record (BR-29, AC-67): closes as closed_by_record? No: Confirm from unanswered → confirmed.
    expect((await contest(rid)).error?.message).toMatch(/^hire_report_answer_closed/);
    expect((await hire(r.referralId, { p_report: rid })).error).toBeNull();
    expect(status(rid)).toBe("confirmed");
    expect(one(`select origin from public.collaboration_agreements where referral_id = '${r.referralId}'`)).toBe("deemed");
  });
});

// =============================================================================================
describe("QA-8 notifications, audit metadata and reminder cadence (BR-23, BR-42, BR-43, AC-43, AC-51, AC-88, AC-89)", () => {
  it("hire_report.filed reaches the job owner and managers only, never B's plain recruiters or A; contest/decision reach A's candidate owner, not A's other recruiters", async () => {
    const since = dbNow();
    const r = await referred();
    expect((await file(r.referralId)).error).toBeNull();
    const rid = reportId(r.referralId);
    expect(notesSince(b.id, since, "hire_report.filed")).toHaveLength(1);
    expect(notesSince(bMgr.id, since, "hire_report.filed")).toHaveLength(1);
    expect(notesSince(bRec.id, since, "hire_report.%")).toHaveLength(0);
    expect(notesSince(a.id, since, "hire_report.filed")).toHaveLength(0);
    expect((await contest(rid)).error).toBeNull();
    expect(notesSince(a.id, since, "hire_report.contested")).toHaveLength(1);
    expect(notesSince(aRec.id, since, "hire_report.%")).toHaveLength(0);
    expect(notesSince(c.id, since)).toHaveLength(0);
  });

  it("reminders: one at business day 5, one at business day 8, never a third, never after an answer", async () => {
    const r = await referred();
    expect((await file(r.referralId)).error).toBeNull();
    const rid = reportId(r.referralId);
    // Filed so that business day 5 has passed but not business day 8.
    const n5 = one(`select min(n) from generate_series(1, 40) n where app.add_business_days(now() - n * interval '1 day', 5) <= now() and app.add_business_days(now() - n * interval '1 day', 8) > now()`);
    const n8 = one(`select min(n) from generate_series(1, 40) n where app.add_business_days(now() - n * interval '1 day', 8) <= now()`);
    sql(`update app.hire_reports set filed_at = now() - ${n5} * interval '1 day', answer_due_at = now() + interval '5 days' where id = '${rid}'`);
    const since = dbNow();
    await sweep();
    await sweep();
    expect(notesSince(b.id, since, "hire_report.reminder"), "day 5").toHaveLength(1);
    sql(`update app.hire_reports set filed_at = now() - ${n8} * interval '1 day' where id = '${rid}'`);
    await sweep();
    await sweep();
    expect(notesSince(b.id, since, "hire_report.reminder"), "day 8").toHaveLength(2);
    // Contested reports get no reminders.
    const r2 = await referred();
    expect((await file(r2.referralId)).error).toBeNull();
    const rid2 = reportId(r2.referralId);
    expect((await contest(rid2)).error).toBeNull();
    sql(`update app.hire_reports set filed_at = now() - interval '20 days' where id = '${rid2}'`);
    const s2 = dbNow();
    await sweep();
    expect(sql(`select count(*) from public.notifications where kind = 'hire_report.reminder' and created_at >= '${s2}' and link like '%${r2.referralId}%'`)[0]).toBe("0");
  });

  it("when a sweep misses day 5 and runs after day 8, B still gets both reminders (AC-51 'once each')", async () => {
    const r = await referred();
    expect((await file(r.referralId)).error).toBeNull();
    const rid = reportId(r.referralId);
    const n8 = one(`select min(n) from generate_series(1, 40) n where app.add_business_days(now() - n * interval '1 day', 8) <= now()`);
    sql(`update app.hire_reports set filed_at = now() - ${n8} * interval '1 day', answer_due_at = now() + interval '2 days' where id = '${rid}'`);
    const since = dbNow();
    await sweep();
    await sweep();
    expect(notesSince(b.id, since, "hire_report.reminder")).toHaveLength(2);
  });

  it("no N3 notification or audit row carries employer text, statements, links, client names or candidate ids", async () => {
    const client = `Auditclient Qq ${uniq()}`;
    const since = dbNow();
    flag(true); // never accepted: the uphold creates a deemed agreement (an accepted referral hits QA-12's bug)
    const r = await referred({ clientName: client });
    expect((await file(r.referralId, { p_statement: "Auditstatement: the candidate told me in writing they started." })).error).toBeNull();
    const rid = reportId(r.referralId);
    expect((await contest(rid, { p_reason: "outside_window", p_offer_accepted_on: daysAgo(20), p_process_started_on: daysAgo(40), p_statement: "Bauditstatement: the process started well after the window." })).error).toBeNull();
    expect((await rebut(rid)).error).toBeNull();
    expect((await platform.client.rpc("admin_set_hire_report_fields", { p_report: rid, p_candidate_contacts: 1, p_client_confirmation: "refused", p_note: "Adminnote secret" })).error).toBeNull();
    expect((await decide(rid, "upheld")).error).toBeNull();
    const pid = one(`select placement_id from app.hire_reports where id = '${rid}'`);
    expect((await fee(pid)).error).toBeNull();
    const blob = sql(`select coalesce(title, '') || ' ' || coalesce(body, '') from public.notifications where created_at >= '${since}' and (link like '%${r.referralId}%' or link like '%${pid}%')`).join("\n")
      + sql(`select metadata::text from public.audit_events where created_at >= '${since}' and (entity_id = '${r.referralId}' or entity_id = '${pid}')`).join("\n");
    expect(blob.length).toBeGreaterThan(0);
    for (const needle of ["Qaemployer", "Auditstatement", "Bauditstatement", "qa-profile-link", "qa-rebuttal-link", "Adminnote", client, one(`select app.client_key('${client}')`), r.cand,
      "10000000", "reported_base"]) {
      expect(blob, needle).not.toContain(needle);
    }
  });
});

// =============================================================================================
describe("QA-9 fee-pending placements and placement disputes (BR-31, BR-33, AC-69, AC-73)", () => {
  it("a placement dispute on a fee-pending placement resolves back to fee_pending; fee details then complete; finance stays blocked meanwhile", async () => {
    const { pid } = await feePending();
    const d = await b.client.rpc("open_dispute", { p_placement: pid, p_reason: "QA: we disagree on the base salary used." });
    expect(d.error).toBeNull();
    expect(one(`select status from public.placements where id = '${pid}'`)).toBe("disputed");
    expect((await fee(pid)).error?.message).toMatch(/^placement_locked/);
    expect((await b.client.rpc("record_invoice", { p_placement: pid, p_invoice_number: "QA-1", p_amount_minor: 100, p_issued_on: today() } as never)).error?.message).toMatch(/placement_fee_pending|not_found|forbidden|Could not find/);
    expect((await platform.client.rpc("resolve_dispute", { p_dispute: d.data as string, p_resolution: "QA: closed without change.", p_upheld: false })).error).toBeNull();
    expect(one(`select status from public.placements where id = '${pid}'`)).toBe("fee_pending");
    expect((await fee(pid)).error).toBeNull();
    expect(one(`select status from public.placements where id = '${pid}'`)).toBe("hire_reported");
  });

  it("deemed and upheld hires are never late; B's confirm of a report far after the start is late (admin-only)", async () => {
    const up = await feePending();
    expect(one(`select x.late from app.hire_record_admin x join public.hire_records h on h.id = x.hire_record_id where h.referral_id = '${up.referralId}'`)).toBe("f");
    const r = await referred();
    await withAgreement(r.referralId);
    expect((await file(r.referralId)).error).toBeNull();
    const rid = reportId(r.referralId);
    expect((await hire(r.referralId, { p_report: rid, p_start_date: daysAgo(30) })).error).toBeNull();
    expect(status(rid)).toBe("confirmed");
    expect(one(`select x.late from app.hire_record_admin x join public.hire_records h on h.id = x.hire_record_id where h.referral_id = '${r.referralId}'`)).toBe("t");
    const bState = JSON.stringify((await b.client.rpc("get_referral_hire_state", { p_referral: r.referralId, p_acting_org: orgB.id })).data);
    const aState = JSON.stringify((await a.client.rpc("get_referral_hire_state", { p_referral: r.referralId, p_acting_org: orgA.id })).data);
    expect(bState + aState).not.toMatch(/"late"/);
    expect(JSON.stringify((await b.client.from("audit_events").select("metadata").eq("entity_id", r.referralId)).data)).not.toMatch(/"late"/);
  });
});

// =============================================================================================
describe("QA-10 release block across hiring orgs and B's view (BR-21, AC-10, AC-47)", () => {
  it("a pending report at B doesn't block release of A's referral at B2 with the same client; B's hire state is identical during the block", async () => {
    const client = `Crossorg Client ${uniq()}`;
    const r1 = await referred({ clientName: client });
    const rB2 = await referred({ clientName: client, tgt: b2, tgtOrg: orgB2.id });
    const rSame = await referred({ clientName: client });
    await move(rB2.referralId, "declined", b2);
    await move(rSame.referralId, "declined");
    const bBefore = (await b.client.rpc("get_referral_hire_state", { p_referral: rSame.referralId, p_acting_org: orgB.id })).data as Record<string, unknown>;
    expect((await file(r1.referralId)).error).toBeNull();
    const bDuring = (await b.client.rpc("get_referral_hire_state", { p_referral: rSame.referralId, p_acting_org: orgB.id })).data as Record<string, unknown>;
    expect(bDuring).toEqual(bBefore);
    expect((await a.client.rpc("release_referral", { p_referral: rSame.referralId, p_acting_org: orgA.id })).error?.message).toMatch(/^release_not_allowed/);
    expect((await a.client.rpc("release_referral", { p_referral: rB2.referralId, p_acting_org: orgA.id })).error).toBeNull();
    // The withdraw path's release checkbox follows the same guard.
    const rW = await referred({ clientName: client });
    const w = await a.client.rpc("withdraw_referral", { p_referral: rW.referralId, p_acting_org: orgA.id, p_reason: "QA: candidate no longer available.", p_release: true } as never);
    if (!w.error) expect(one(`select coalesce(void_reason, 'none') from app.referral_presentations where referral_id = '${rW.referralId}'`)).not.toBe("released");
  });

  it("union key: a referral matching only by delivery key (or only commit key) is blocked too", async () => {
    const client = `Unionkey Client ${uniq()}`;
    const k = one(`select app.client_key('${client}')`);
    const r1 = await referred({ clientName: client });
    const r2 = await referred();
    const r3 = await referred();
    await move(r2.referralId, "declined");
    await move(r3.referralId, "declined");
    // r2 shares only the commit key; r3 only the delivery key.
    sql(`update app.referral_commit_keys set client_key = '${k}' where referral_id = '${r2.referralId}'`);
    replica(`update app.referral_presentations set client_key = '${k}' where referral_id = '${r3.referralId}'`);
    expect((await file(r1.referralId)).error).toBeNull();
    for (const r of [r2, r3]) expect((await a.client.rpc("release_referral", { p_referral: r.referralId, p_acting_org: orgA.id })).error?.message, r.referralId).toMatch(/^release_not_allowed/);
  });
});

// =============================================================================================
describe("QA-12 admin uphold on a referral still in progress (BR-27, BR-10, AC-58)", () => {
  for (const st of ["accepted", "interviewing", "offer"] as const) {
    it(`uphold creates the fee-pending placement when the referral is still ${st} (pipeline owner = B's member)`, async () => {
      const r = await referred();
      await withAgreement(r.referralId);
      if (st !== "accepted") await move(r.referralId, "interviewing");
      if (st === "offer") await move(r.referralId, "offer");
      expect((await file(r.referralId)).error).toBeNull();
      const rid = reportId(r.referralId);
      expect((await contest(rid)).error).toBeNull();
      expect((await rebut(rid)).error).toBeNull();
      const res = await decide(rid, "upheld");
      expect(res.error).toBeNull();
      expect(status(rid)).toBe("upheld");
      expect(one(`select status || '/' || established_how from public.placements where referral_id = '${r.referralId}'`)).toBe("fee_pending/upheld");
    });
  }
});
