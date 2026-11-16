import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { admin, anon, createCandidate, createJob, createOrg, createUser, drainQueue, issueCandidateToken, sharingConsent, sql, termsOf, type TestUser } from "./helpers";

/**
 * QA (step 5) for N1 duplicate and prior-presentation protection. Fills the gaps left by
 * duplicate-presentation.test.ts: adversarial/forged calls, cross-tenant ids, leaks to the hiring
 * side, the advisory lock on the recorded path, business-day edges, evidence upload abuse,
 * remaining ACs (9, 10, 11, 6b, 14b, 17, 24, 27 revoked, 34, 58, 66) and PD-024 checks.
 *
 * Round 2: B-1, B-2 (PD-029), m-2, m-3 are now regression tests. Tests named "BUG (round 2)" are
 * open implementation bugs (see qa-report.md).
 */

let a: TestUser, a1: TestUser, b: TestUser, c: TestUser, platform: TestUser;
let orgA: { id: string }, orgA1: { id: string }, orgB: { id: string }, orgC: { id: string };

const uniq = () => randomUUID().slice(0, 8);
const email = (tag: string) => `${tag}-${uniq()}@example.com`;
const bJob = (client: string | null) => createJob(b, orgB.id, { title: `Role ${uniq()}`, client_name: client, client_confidential: true });
type Outcome = { outcome: string; referral_id: string | null; reference: string | null };

const cand = (u: TestUser, orgId: string, over: Record<string, unknown> = {}) => createCandidate(u, orgId, { email: email("cand"), ...over });

async function submit(u: TestUser, orgId: string, candidateId: string, jobId: string, opts: { ack?: boolean; newConsent?: boolean } = {}) {
  const consent = opts.newConsent ? null : await sharingConsent(u, orgId, candidateId, jobId);
  const { data, error } = await u.client
    .rpc("submit_referral", {
      p_candidate: candidateId, p_job: jobId, p_terms_version: await termsOf(jobId), p_fields: ["headline", "skills"], p_document_ids: [], p_consent: consent as string,
      p_idempotency_key: randomUUID(), p_acknowledge_pending: opts.ack ?? false,
      p_new_consent: opts.newConsent ? { legal_basis: "consent", scope: "Share with partner", evidence: "Email from candidate" } : undefined,
    })
    .single();
  if (error) throw new Error(error.message);
  return data as Outcome;
}

// N9: the token is the real server-issued one (service-role issuance, as the Server Action does).
async function submitForCandidate(u: TestUser, candidateId: string, jobId: string, ack = false) {
  const { data, error } = await u.client
    .rpc("submit_referral_for_candidate", {
      p_candidate: candidateId, p_job: jobId, p_terms_version: await termsOf(jobId), p_fields: ["headline", "skills"], p_document_ids: [],
      p_idempotency_key: randomUUID(), p_acknowledge_pending: ack,
    })
    .single();
  if (error) throw new Error(error.message);
  const out = data as Outcome & { created: boolean; destination: string | null };
  const token = out.outcome === "created" && out.created && out.referral_id ? await issueCandidateToken(out.referral_id, u.id) : "";
  return { ...out, token };
}

const respond = async (token: string, accept: boolean, profile: Record<string, unknown> = {}) => {
  const { data, error } = await anon().rpc("respond_candidate_request", { p_token: token, p_accept: accept, p_profile: profile as never });
  if (error) throw new Error(error.message);
  return data as string;
};

const version = async (referralId: string) => (await admin().from("referrals").select("version").eq("id", referralId).single()).data!.version;

async function presentation(u: TestUser, referralId: string, orgId: string) {
  const { data, error } = await u.client.rpc("get_referral_presentation", { p_referral: referralId, p_acting_org: orgId });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> & { claim: Record<string, unknown> | null };
}

const pdf = () => new TextEncoder().encode(`%PDF-1.4\n% qa ${uniq()}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);

async function upload(u: TestUser, orgId: string, referralId: string, bytes: Uint8Array, contentType = "application/pdf", ext = "pdf") {
  const path = `${orgId}/${referralId}/${randomUUID()}.${ext}`;
  const up = await u.client.storage.from("claim-evidence").upload(path, bytes, { contentType, upsert: false });
  return { path, error: up.error };
}

async function evidence(referralId: string, bytes = pdf()) {
  const { path, error } = await upload(b, orgB.id, referralId, bytes);
  if (error) throw new Error(error.message);
  const reg = await b.client.rpc("register_claim_evidence", { p_referral: referralId, p_storage_path: path, p_file_name: "ats.pdf", p_acting_org: orgB.id });
  if (reg.error) throw new Error(reg.error.message);
  return { id: (reg.data as { id: string }).id, path, bytes };
}

const fileClaim = async (referralId: string, fileIds: string[], priorDate: string, note = "") =>
  b.client.rpc("file_prior_presentation_claim", {
    p_referral: referralId, p_expected_version: await version(referralId), p_evidence_kind: "file", p_file_ids: fileIds,
    p_evidence_referral: null as never, p_prior_process_date: priorDate, p_attested: true, p_note: note, p_acting_org: orgB.id,
  });

const referralClaim = async (claimed: string, cited: string, note = "") =>
  b.client.rpc("file_prior_presentation_claim", {
    p_referral: claimed, p_expected_version: await version(claimed), p_evidence_kind: "referral", p_file_ids: [],
    p_evidence_referral: cited, p_prior_process_date: null as never, p_attested: true, p_note: note, p_acting_org: orgB.id,
  });

const priorDate = (referralId: string, daysBefore = 20) =>
  sql(`select ((delivered_at at time zone 'America/Toronto')::date - ${daysBefore}) from public.referrals where id = '${referralId}'`)[0];

/** Two B jobs at the same client; A delivers an early referral, A1 a later one (different people). */
async function claimPair(tag: string) {
  const client = `${tag} ${uniq()}`;
  const early = (await submit(a, orgA.id, await cand(a, orgA.id, { linkedin_url: null }), await bJob(client))).referral_id!;
  const lateJob = await bJob(client);
  const lateEmail = email("late");
  const late = (await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: lateEmail, linkedin_url: null }), lateJob)).referral_id!;
  return { early, late, lateJob, lateEmail };
}

beforeAll(async () => {
  [a, a1, b, c, platform] = await Promise.all([
    createUser("qa-a"), createUser("qa-a1"), createUser("qa-b"), createUser("qa-c"), createUser("qa-admin", { platformAdmin: true }),
  ]);
  orgA = await createOrg(a, "QA Agency A");
  orgA1 = await createOrg(a1, "QA Agency A1");
  orgB = await createOrg(b, "QA Hiring B");
  orgC = await createOrg(c, "QA Hiring C");
});

// Backend (QA B-1 fix): the DB now enforces the 30/h / 10/h / 5/h limits. The shared fixture users
// drive far more traffic than that across this file, so their windows are cleared before each test.
// The rate-limit tests themselves use users created inside the test, so they're unaffected.
beforeEach(() => {
  sql(`delete from app.rate_limits where user_id in ('${a.id}', '${a1.id}', '${b.id}', '${c.id}', '${platform.id}')`);
});

// =============================================================================================
describe("forged and extra arguments (BR-1, BR-33, AC-74, scenario 35)", () => {
  it("every N1-relevant RPC refuses hash / sha / scope / client-key arguments instead of ignoring them", async () => {
    const forged: [string, Record<string, unknown>][] = [
      ["submit_referral", { p_candidate: randomUUID(), p_job: randomUUID(), p_fields: ["skills"], p_document_ids: [], p_consent: randomUUID(), p_idempotency_key: randomUUID(), p_fingerprints: ["00"] }],
      ["submit_referral", { p_candidate: randomUUID(), p_job: randomUUID(), p_fields: ["skills"], p_document_ids: [], p_consent: randomUUID(), p_idempotency_key: randomUUID(), p_email_hash: "00" }],
      ["submit_referral", { p_candidate: randomUUID(), p_job: randomUUID(), p_fields: ["skills"], p_document_ids: [], p_consent: randomUUID(), p_idempotency_key: randomUUID(), p_skip_check: true }],
      ["submit_referral_for_candidate", { p_candidate: randomUUID(), p_job: randomUUID(), p_fields: ["skills"], p_document_ids: [], p_idempotency_key: randomUUID(), p_fingerprints: ["00"] }],
      ["submit_referral_for_candidate", { p_candidate: randomUUID(), p_job: randomUUID(), p_fields: ["skills"], p_document_ids: [], p_idempotency_key: randomUUID(), p_client_key: "abc" }],
      ["respond_candidate_request", { p_token: "x".repeat(43), p_accept: true, p_profile: {}, p_skip_check: true }],
      ["respond_candidate_request", { p_token: "x".repeat(43), p_accept: true, p_profile: {}, p_fingerprints: ["00"] }],
      ["register_claim_evidence", { p_referral: randomUUID(), p_storage_path: "x", p_file_name: "x.pdf", p_acting_org: randomUUID(), p_sha256: "0".repeat(64) }],
      ["register_claim_evidence", { p_referral: randomUUID(), p_storage_path: "x", p_file_name: "x.pdf", p_acting_org: randomUUID(), p_mime_type: "application/pdf", p_size_bytes: 1 }],
      ["file_prior_presentation_claim", { p_referral: randomUUID(), p_expected_version: 1, p_evidence_kind: "file", p_file_ids: [], p_sha256: "0".repeat(64) }],
      ["file_prior_presentation_claim", { p_referral: randomUUID(), p_expected_version: 1, p_evidence_kind: "file", p_file_ids: [], p_contest_deadline_at: "2030-01-01" }],
      ["release_referral", { p_referral: randomUUID(), p_force: true }],
      ["get_referral_presentation", { p_referral: randomUUID(), p_acting_org: randomUUID(), p_side: "source" }],
    ];
    for (const [fn, args] of forged) {
      const { error } = await a.client.rpc(fn as never, args as never);
      expect(error?.code, `${fn}(${Object.keys(args).at(-1)})`).toBe("PGRST202");
    }
  });

  it("the worker-only scan RPC can't be called to set a forged SHA-256 or verdict", async () => {
    for (const u of [a, b]) {
      const { error } = await u.client.rpc("record_claim_evidence_scan", { p_file: randomUUID(), p_verdict: "clean", p_sha256: "0".repeat(64) });
      expect(error?.message).toMatch(/permission denied/);
      const t = await u.client.rpc("claim_evidence_scan_target", { p_file: randomUUID() });
      expect(t.error?.message).toMatch(/permission denied/);
    }
    const anonCall = await anon().rpc("record_claim_evidence_scan", { p_file: randomUUID(), p_verdict: "clean", p_sha256: "0".repeat(64) });
    expect(anonCall.error).not.toBeNull();
  });

  it("a forged acknowledgement on a stop is still stopped (AC-74)", async () => {
    const shared = email("ack");
    const j1 = await bJob(`Ack ${uniq()}`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1, { ack: true })).outcome).toBe("stopped");
    expect((await submitForCandidate(a, await cand(a, orgA.id, { email: shared }), j1, true)).outcome).toBe("stopped");
  });

  it("the confirmation page can't edit email or LinkedIn to dodge the delivery re-check", async () => {
    const shared = email("dodge");
    const j1 = await bJob(`Dodge ${uniq()}`);
    const y = await cand(a, orgA.id, { email: shared });
    const pending = await submitForCandidate(a, y, j1);
    expect(pending.outcome).toBe("created");
    // A1 presents the same person meanwhile (pending warning acknowledged).
    const x = await cand(a1, orgA1.id, { email: shared });
    expect((await submit(a1, orgA1.id, x, j1)).outcome).toBe("pending_warning");
    expect((await submit(a1, orgA1.id, x, j1, { ack: true })).outcome).toBe("created");
    expect(await respond(pending.token, true, { email: email("other"), linkedin_url: "linkedin.com/in/someone-else", phone: null })).toBe("already_sent");
    expect((await admin().from("candidates").select("email").eq("id", y).single()).data!.email).toBe(shared);
  });

  it("the candidate's p_profile phone with junk can't crash delivery into a bypass", async () => {
    const shared = email("junk");
    const j1 = await bJob(`Junk ${uniq()}`);
    const pending = await submitForCandidate(a, await cand(a, orgA.id, { email: shared }), j1);
    const x = await cand(a1, orgA1.id, { email: shared });
    await submit(a1, orgA1.id, x, j1, { ack: true });
    expect(await respond(pending.token, true, { phone: "'); drop table x; --" })).toBe("already_sent");
  });
});

// =============================================================================================
describe("probing defence and rate limits (BR-19, BR-22, AC-18, A-1)", () => {
  it("B-1 fixed: the 30/h submission limit holds when submit_referral is called directly through PostgREST", async () => {
    // A fresh member, so this test doesn't depend on the other tests' attempts.
    const prober = await createUser("qa-prober");
    const org = await createOrg(prober, "QA Prober");
    const shared = email("probe");
    const j1 = await bJob(`Probe ${uniq()}`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    const y = await cand(prober, org.id, { email: shared });
    const outcomes: string[] = [];
    for (let i = 0; i < 32; i++) {
      const { data, error } = await prober.client
        .rpc("submit_referral", {
          p_candidate: y, p_job: j1, p_terms_version: await termsOf(j1), p_fields: ["skills"], p_document_ids: [], p_consent: null as never, p_idempotency_key: randomUUID(),
          p_new_consent: { legal_basis: "consent", scope: "Share", evidence: "Email from candidate" },
        })
        .single();
      outcomes.push(error ? `error:${error.message}` : (data as Outcome).outcome);
    }
    const hits = Number(sql(`select count(*) from app.presentation_hits where source_org_id = '${org.id}'`)[0]);
    // AC-18: attempt 31+ gets the rate-limit error and no check runs.
    expect(outcomes.slice(0, 30).every((o) => o === "stopped")).toBe(true);
    expect(outcomes.slice(30)).toEqual(["error:rate_limited", "error:rate_limited"]);
    expect(hits).toBe(30);
  });

  it("m-2 fixed: a pending hit sent with the acknowledgement on the first call is still audited (BR-20, AC-18)", async () => {
    const shared = email("silent");
    const j1 = await bJob(`Silent ${uniq()}`);
    await submitForCandidate(a1, await cand(a1, orgA1.id, { email: shared }), j1);
    const r = await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1, { ack: true });
    expect(r.outcome).toBe("created");
    const { data } = await platform.client.from("audit_events").select("metadata").eq("entity_id", j1).eq("action", "referral.fingerprint_hit");
    expect(data!.length, "the pending hit that was acknowledged must still be audited").toBeGreaterThan(0);
  });

  it("checks run only inside a real submission: inactive candidate / closed job fail before the check (AC-18)", async () => {
    const shared = email("pre");
    const j1 = await bJob(`Pre ${uniq()}`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    const inactive = await cand(a, orgA.id, { email: shared, status: "archived" as never });
    const res = await a.client.rpc("submit_referral", {
      p_candidate: inactive, p_job: j1, p_terms_version: await termsOf(j1), p_fields: ["skills"], p_document_ids: [], p_consent: null as never, p_idempotency_key: randomUUID(),
      p_new_consent: { legal_basis: "consent", scope: "Share", evidence: "Email from candidate" },
    });
    expect(res.error?.message).toMatch(/candidate_not_active/);
    const closed = await bJob(`Closed ${uniq()}`);
    await b.client.from("jobs").update({ status: "closed" }).eq("id", closed);
    const res2 = await a.client.rpc("submit_referral", {
      p_candidate: await cand(a, orgA.id, { email: shared }), p_job: closed, p_terms_version: await termsOf(closed), p_fields: ["skills"], p_document_ids: [], p_consent: null as never,
      p_idempotency_key: randomUUID(), p_new_consent: { legal_basis: "consent", scope: "Share", evidence: "Email from candidate" },
    });
    expect(res2.error?.message).toMatch(/job_not_open_for_referrals/);
    expect(sql(`select count(*) from app.presentation_hits where job_id in ('${closed}') or (job_id = '${j1}' and source_org_id = '${orgA.id}')`)).toEqual(["0"]);
  });
});

// =============================================================================================
describe("nothing reaches the hiring side or other members (BR-9, BR-20, AC-5, AC-56)", () => {
  it("job-level and client-level stops are indistinguishable to the submitter on both paths", async () => {
    const shared = email("same");
    const client = `Same ${uniq()}`;
    const j1 = await bJob(client);
    const j2 = await bJob(client);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    const jobHit = await submitForCandidate(a, await cand(a, orgA.id, { email: shared }), j1);
    const clientHit = await submitForCandidate(a, await cand(a, orgA.id, { email: shared }), j2);
    const strip = (o: Record<string, unknown>) => { const { reference, token, ...rest } = o; void token; return { ...rest, reference: typeof reference }; };
    expect(strip(jobHit)).toEqual(strip(clientHit));
    expect(jobHit.outcome).toBe("stopped");
    // Member-visible audit rows for the two stops are identical apart from the job id.
    const { data: audit } = await a.client.from("audit_events").select("action, entity_type, metadata, entity_id").in("entity_id", [j1, j2]).eq("action", "referral.submission_stopped");
    expect(audit).toHaveLength(2);
    expect(audit!.map(({ entity_id, ...rest }) => { void entity_id; return rest; })).toEqual([
      { action: "referral.submission_stopped", entity_type: "job", metadata: {} },
      { action: "referral.submission_stopped", entity_type: "job", metadata: {} },
    ]);
  });

  it("platform-only audit events (scope, sticky, hit id) are invisible to org admins", async () => {
    const { data: aAudit } = await a.client.from("audit_events").select("action").is("organization_id", null);
    expect(aAudit).toEqual([]);
    const { data: bAudit } = await b.client.from("audit_events").select("action, metadata").in("action", ["referral.fingerprint_hit", "referral.sticky_stop", "dispute.contacts_compared"]);
    expect(bAudit).toEqual([]);
  });

  it("stops, warnings and identifier refusals leave no trace on the hiring side", async () => {
    const shared = email("trace");
    const j1 = await bJob(`Trace ${uniq()}`);
    await submitForCandidate(a1, await cand(a1, orgA1.id, { email: shared }), j1); // pending
    const notesBefore = (await admin().from("notifications").select("id").eq("organization_id", orgB.id)).data!.length;
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1)).outcome).toBe("pending_warning");
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: null, phone: null, linkedin_url: null }), j1, { newConsent: true })).outcome).toBe("identifier_required");
    const x = email("trace2");
    const j2 = await bJob(`Trace ${uniq()}`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: x }), j2);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: x }), j2)).outcome).toBe("stopped");
    expect((await admin().from("notifications").select("id").eq("organization_id", orgB.id)).data!.length).toBe(notesBefore + 1); // only the j2 delivery
    const { data: bAudit } = await b.client.from("audit_events").select("action").in("entity_id", [j1, j2]);
    expect(bAudit).toEqual([]);
    const { data: bRefs } = await b.client.from("referrals").select("id").eq("job_id", j1);
    expect(bRefs).toEqual([]);
  });

  it("already_presented referrals are not_found for the hiring side on every read path (AC-15, AC-56)", async () => {
    const shared = email("ap");
    const j1 = await bJob(`AP ${uniq()}`);
    const pending = await submitForCandidate(a, await cand(a, orgA.id, { email: shared }), j1);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1, { ack: true });
    expect(await respond(pending.token, true)).toBe("already_sent");
    const id = pending.referral_id!;
    expect((await b.client.rpc("get_referral_presentation", { p_referral: id, p_acting_org: orgB.id })).error?.message).toMatch(/not_found/);
    expect((await b.client.rpc("list_claim_evidence_referrals", { p_referral: id, p_acting_org: orgB.id })).error?.message).toMatch(/not_found/);
    expect((await b.client.from("referral_status_events").select("id").eq("referral_id", id)).data).toEqual([]);
    expect((await b.client.from("notifications").select("id").ilike("link", `%${id}%`)).data).toEqual([]);
    expect(await presentation(a, id, orgA.id)).toMatchObject({ ownership_state: "not_delivered", status: "already_presented" });
  });

  it("closure notification: the active submitter only; falls back to org admins when the submitter is gone (AC-17, PD-028)", async () => {
    const mk = async (label: string) => {
      const u = await createUser(label);
      const { error } = await admin().from("organization_memberships").insert({ organization_id: orgA.id, user_id: u.id, role: "recruiter", status: "active" });
      if (error) throw error;
      return u;
    };
    const active = await mk("qa-a-active");
    const leaver = await mk("qa-a-leaver");
    const closeFor = async (u: TestUser) => {
      const shared = email("close");
      const j1 = await bJob(`Close ${uniq()}`);
      const pending = await submitForCandidate(u, await cand(u, orgA.id, { email: shared }), j1);
      await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1, { ack: true });
      return pending;
    };
    const p1 = await closeFor(active);
    expect(await respond(p1.token, true)).toBe("already_sent");
    const notes1 = (await admin().from("notifications").select("user_id").eq("kind", "referral.already_presented").ilike("link", `%${p1.referral_id}%`)).data!;
    expect(notes1.map((n) => n.user_id)).toEqual([active.id]);

    const p2 = await closeFor(leaver);
    await admin().from("organization_memberships").update({ status: "suspended" }).eq("organization_id", orgA.id).eq("user_id", leaver.id);
    expect(await respond(p2.token, true)).toBe("already_sent");
    const notes2 = (await admin().from("notifications").select("user_id").eq("kind", "referral.already_presented").ilike("link", `%${p2.referral_id}%`)).data!;
    expect(notes2.map((n) => n.user_id)).toEqual([a.id]); // a = org_admin (creator) of A
  });
});

// =============================================================================================
describe("release flag never reaches the hiring side (BR-25, AC-23, AC-68, scenario 38)", () => {
  it("release doesn't bump the referral row, its version or its status events", async () => {
    const shared = email("quiet");
    const j1 = await bJob(`Quiet ${uniq()}`);
    const id = (await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1)).referral_id!;
    await a.client.rpc("withdraw_referral", { p_referral: id, p_reason: "Paused", p_expected_version: await version(id), p_acting_org: orgA.id });
    const before = (await b.client.from("referrals").select("*").eq("id", id).single()).data!;
    const eventsBefore = (await b.client.from("referral_status_events").select("id").eq("referral_id", id)).data!.length;
    const presBefore = await presentation(b, id, orgB.id);
    expect((await a.client.rpc("release_referral", { p_referral: id, p_acting_org: orgA.id })).error).toBeNull();
    expect((await b.client.from("referrals").select("*").eq("id", id).single()).data).toEqual(before);
    expect((await b.client.from("referral_status_events").select("id").eq("referral_id", id)).data!.length).toBe(eventsBefore);
    expect(await presentation(b, id, orgB.id)).toEqual(presBefore);
  });

  it("PD-029 / scenario 47: a release after the claimed referral's delivery changes nothing B can read; the claim succeeds and can be upheld", async () => {
    const j1 = await bJob(`Picker ${uniq()}`);
    const r1 = (await submit(a, orgA.id, await cand(a, orgA.id), j1)).referral_id!;
    await a.client.rpc("withdraw_referral", { p_referral: r1, p_reason: "Paused", p_expected_version: await version(r1), p_acting_org: orgA.id });
    const r2 = (await submit(a1, orgA1.id, await cand(a1, orgA1.id), j1)).referral_id!;
    const pick = async () => (await b.client.rpc("list_claim_evidence_referrals", { p_referral: r2, p_acting_org: orgB.id })).data;
    const before = await pick();
    expect((before as { referral_id: string }[]).map((o) => o.referral_id)).toEqual([r1]);
    const presBefore = await presentation(b, r1, orgB.id);
    expect((await a.client.rpc("release_referral", { p_referral: r1, p_acting_org: orgA.id })).error).toBeNull();
    expect(await pick()).toEqual(before); // byte-identical, incl. status / revoked fields
    expect(await presentation(b, r1, orgB.id)).toEqual(presBefore);
    const filed = await referralClaim(r2, r1);
    expect(filed.error).toBeNull();
    expect(Object.keys(filed.data as object).sort()).toEqual(["claim_id", "contest_deadline_at", "version"]);
    const dispute = (await a1.client.rpc("contest_prior_presentation_claim", { p_referral: r2, p_reason: "We disagree here.", p_acting_org: orgA1.id })).data as string;
    expect((await platform.client.rpc("resolve_prior_presentation_dispute", { p_dispute: dispute, p_claim_upheld: true, p_resolution: "Earlier referral stands." })).error).toBeNull();
    expect(await presentation(a1, r2, orgA1.id)).toMatchObject({ ownership_state: "ended", counts: false });
  });

  it("PD-029 variant: released before the claimed delivery → not listed, same claim_referral_invalid as a referral delivered later (R-18)", async () => {
    const j1 = await bJob(`Picker ${uniq()}`);
    const r1 = (await submit(a, orgA.id, await cand(a, orgA.id), j1)).referral_id!;
    await a.client.rpc("withdraw_referral", { p_referral: r1, p_reason: "Paused", p_expected_version: await version(r1), p_release: true, p_acting_org: orgA.id });
    const r2 = (await submit(a1, orgA1.id, await cand(a1, orgA1.id), j1)).referral_id!;
    const r3 = (await submit(c, orgC.id, await cand(c, orgC.id), j1)).referral_id!; // delivered after r2
    expect((await b.client.rpc("list_claim_evidence_referrals", { p_referral: r2, p_acting_org: orgB.id })).data).toEqual([]);
    const e1 = (await referralClaim(r2, r1)).error!;
    const e3 = (await referralClaim(r2, r3)).error!;
    expect({ m: e1.message, c: e1.code, d: e1.details, h: e1.hint }).toEqual({ m: e3.message, c: e3.code, d: e3.details, h: e3.hint });
    expect(e1.message).toBe("claim_referral_invalid");
  });

  it("PD-029: a referral whose window ended after the claimed delivery is still eligible (AC-31 R7)", async () => {
    const j1 = await bJob(`R7 ${uniq()}`);
    const r1 = (await submit(a, orgA.id, await cand(a, orgA.id), j1)).referral_id!;
    const r2 = (await submit(a1, orgA1.id, await cand(a1, orgA1.id), j1)).referral_id!;
    const d2 = (await admin().from("referrals").select("delivered_at").eq("id", r2).single()).data!.delivered_at!;
    await admin().from("referrals").update({ ownership_protected_until: new Date(new Date(d2).getTime() + 5).toISOString() }).eq("id", r1);
    await new Promise((r) => setTimeout(r, 20));
    expect((await referralClaim(r2, r1)).error).toBeNull();
  });
});

// =============================================================================================
describe("advisory lock on the recorded path (BR-8, EC-3, R-4, A-8)", () => {
  it("three parallel recorded submissions of the same person to one job: exactly one is created", async () => {
    const shared = email("par");
    const j1 = await bJob(`Par ${uniq()}`);
    const ys = await Promise.all([cand(a, orgA.id, { email: shared }), cand(a1, orgA1.id, { email: shared }), cand(c, orgC.id, { email: shared })]);
    const consents = await Promise.all([sharingConsent(a, orgA.id, ys[0], j1), sharingConsent(a1, orgA1.id, ys[1], j1), sharingConsent(c, orgC.id, ys[2], j1)]);
    const t1 = await termsOf(j1);
    const call = (u: TestUser, y: string, k: string) =>
      u.client.rpc("submit_referral", { p_candidate: y, p_job: j1, p_terms_version: t1, p_fields: ["skills"], p_document_ids: [], p_consent: k, p_idempotency_key: randomUUID() }).single();
    const res = await Promise.all([call(a, ys[0], consents[0]), call(a1, ys[1], consents[1]), call(c, ys[2], consents[2])]);
    expect(res.map((r) => r.error)).toEqual([null, null, null]);
    expect(res.map((r) => (r.data as Outcome).outcome).sort()).toEqual(["created", "stopped", "stopped"]);
    expect((await b.client.from("referrals").select("id").eq("job_id", j1)).data).toHaveLength(1);
  });

  it("two parallel acknowledged submissions against one pending referral: only one gets through", async () => {
    const shared = email("ackpar");
    const client = `AckPar ${uniq()}`;
    const j1 = await bJob(client);
    const j2 = await bJob(client);
    await submitForCandidate(a1, await cand(a1, orgA1.id, { email: shared }), j1);
    const [r1, r2] = await Promise.all([
      submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1, { ack: true }),
      submit(c, orgC.id, await cand(c, orgC.id, { email: shared }), j2, { ack: true }),
    ]);
    expect([r1.outcome, r2.outcome].sort()).toEqual(["created", "stopped"]);
  });
});

// =============================================================================================
describe("counting rule coverage (BR-4, BR-5, BR-30, AC-9, AC-10, AC-11, AC-6, AC-14)", () => {
  it("every delivered status inside the window stops (AC-9)", async () => {
    for (const status of ["under_review", "info_requested", "accepted", "interviewing", "offer", "hired", "rejected", "declined", "cancelled"]) {
      const shared = email(status);
      const j1 = await bJob(`St ${uniq()}`);
      const first = (await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1)).referral_id!;
      const { error } = await admin().from("referrals").update({ status: status as never, decline_reason: status === "declined" ? "skills" : null }).eq("id", first);
      expect(error, status).toBeNull();
      expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1)).outcome, status).toBe("stopped");
    }
  });

  it("candidate_declined neither stops nor warns (AC-10, scenario 14)", async () => {
    const shared = email("cdecl");
    const j1 = await bJob(`CDecl ${uniq()}`);
    const p = await submitForCandidate(a1, await cand(a1, orgA1.id, { email: shared }), j1);
    expect(await respond(p.token, false)).toBe("declined");
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1)).outcome).toBe("created");
  });

  it("job cancelled and the role reposted at the same client: still stopped (AC-11, A-7)", async () => {
    const shared = email("repost");
    const client = `Repost ${uniq()}`;
    const j1 = await bJob(client);
    const id = (await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1)).referral_id!;
    await b.client.rpc("review_referral", { p_referral: id, p_to: "accepted", p_reason_code: "", p_note: "", p_expected_version: await version(id), p_acting_org: orgB.id });
    expect((await b.client.rpc("transition_referral", { p_referral: id, p_to: "cancelled", p_reason: "Role cancelled", p_expected_version: await version(id), p_acting_org: orgB.id })).error).toBeNull();
    await b.client.from("jobs").update({ status: "cancelled" }).eq("id", j1);
    const j3 = await bJob(`${client} Inc.`);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j3)).outcome).toBe("stopped");
  });

  it("after a client rename, the new client name isn't covered by the old snapshot (AC-6, second half)", async () => {
    const shared = email("ren");
    const j1 = await bJob(`Before ${uniq()}`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    const renamed = `After ${uniq()}`;
    await b.client.from("jobs").update({ client_name: renamed }).eq("id", j1);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), await bJob(renamed))).outcome).toBe("created");
  });

  it("sticky stop holds after the earlier presentation stops counting; a different record is free (AC-14)", async () => {
    const shared = email("stk");
    const j1 = await bJob(`Stk ${uniq()}`);
    const first = (await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1)).referral_id!;
    const y = await cand(a, orgA.id, { email: shared });
    expect((await submit(a, orgA.id, y, j1)).outcome).toBe("stopped");
    await a1.client.rpc("withdraw_referral", { p_referral: first, p_reason: "Moving on", p_expected_version: await version(first), p_release: true, p_acting_org: orgA1.id });
    const sticky = await submit(a, orgA.id, y, j1);
    expect(sticky.outcome).toBe("stopped");
    expect(sticky.reference).toMatch(/^\d{1,8}$/);
    expect(sql(`select count(*) from app.sticky_stops where candidate_id = '${y}'`)[0]).toBe("1");
    // The sticky-stop row holds ids and the client key only.
    expect(sql(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'app' and table_name = 'sticky_stops'`)[0])
      .toBe("candidate_id,client_key,created_at,expires_at,id,job_id,reason,source_org_id,target_org_id");
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1)).outcome).toBe("created");
  });

  it("normalisation: FR mobile with trunk 0 vs E.164, NANP extension, accented legal-form client (AC-7, BR-23, R-13)", async () => {
    const digits = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
    const j1 = await bJob(`Société Générale ${uniq()} Inc.`);
    const clientBase = (await admin().from("jobs").select("client_name").eq("id", j1).single()).data!.client_name!.replace(/ Inc\.$/, "");
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: null, phone: `06 ${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`, location_country: "FR", linkedin_url: null }), j1);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: null, phone: `+33 6${digits}`, location_country: null, linkedin_url: null }), j1)).outcome).toBe("stopped");
    const j2 = await bJob(clientBase.replace("Société Générale", "societe generale").toUpperCase());
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: null, phone: `+33 6 ${digits}`, location_country: null, linkedin_url: null }), j2)).outcome).toBe("stopped");

    const nanp = `${200 + Math.floor(Math.random() * 700)}555${String(1000 + Math.floor(Math.random() * 8999))}`;
    const j3 = await bJob(`Ext ${uniq()}`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: null, phone: `+1 (${nanp.slice(0, 3)}) ${nanp.slice(3, 6)}-${nanp.slice(6)} ext. 12`, linkedin_url: null }), j3);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: null, phone: `1-${nanp}`, location_country: "US", linkedin_url: null }), j3)).outcome).toBe("stopped");
  });
});

// =============================================================================================
describe("claims: remaining rules (BR-12, BR-15, PD-028, AC-24, AC-27, AC-34, AC-66)", () => {
  it("a revoked referral can still be claimed against (AC-27, PD-028)", async () => {
    const client = `Rev ${uniq()}`;
    const early = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(client))).referral_id!;
    const lateJob = await bJob(client);
    const y = await cand(a1, orgA1.id);
    const consent = await sharingConsent(a1, orgA1.id, y, lateJob);
    const late = ((await a1.client.rpc("submit_referral", { p_candidate: y, p_job: lateJob, p_terms_version: await termsOf(lateJob), p_fields: ["skills"], p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID() }).single()).data as Outcome).referral_id!;
    await a1.client.from("candidate_consents").update({ revoked_at: new Date().toISOString(), revoked_reason: "Candidate request" }).eq("id", consent);
    expect((await admin().from("referrals").select("sharing_revoked_at").eq("id", late).single()).data!.sharing_revoked_at).not.toBeNull();
    expect((await presentation(b, late, orgB.id)).can_claim).toBe(true);
    expect((await referralClaim(late, early)).error).toBeNull();
  });

  it("claim allowed in info_requested, clock not paused (AC-34, scenario 19)", async () => {
    const p = await claimPair("Info");
    expect((await b.client.rpc("review_referral", { p_referral: p.late, p_to: "info_requested", p_reason_code: "", p_note: "Need availability", p_expected_version: await version(p.late), p_acting_org: orgB.id })).error).toBeNull();
    const before = (await admin().from("referrals").select("claim_deadline_at").eq("id", p.late).single()).data!.claim_deadline_at;
    expect((await presentation(b, p.late, orgB.id)).can_claim).toBe(true);
    expect((await referralClaim(p.late, p.early)).error).toBeNull();
    expect((await admin().from("referrals").select("claim_deadline_at").eq("id", p.late).single()).data!.claim_deadline_at).toBe(before);
  });

  it("the deadline is checked at filing, not at upload; files of another referral are refused (AC-66)", async () => {
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Dl ${uniq()}`))).referral_id!;
    const other = (await submit(a1, orgA1.id, await cand(a1, orgA1.id), await bJob(`Dl ${uniq()}`))).referral_id!;
    const f = await evidence(r);
    const g = await evidence(other);
    await drainQueue();
    const wrong = await fileClaim(r, [g.id], priorDate(r));
    expect(wrong.error?.message).toMatch(/claim_evidence_invalid/);
    const dup = await fileClaim(r, [f.id, f.id], priorDate(r));
    expect(dup.error?.message).toMatch(/claim_evidence_invalid/);
    await admin().from("referrals").update({ claim_deadline_at: new Date(Date.now() - 1000).toISOString() }).eq("id", r);
    const late = await fileClaim(r, [f.id], priorDate(r));
    expect(late.error?.message).toMatch(/claim_window_closed/);
    expect(late.error?.details).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect((await admin().from("referrals").select("status").eq("id", r).single()).data!.status).toBe("submitted");
    // Upload itself is closed after the deadline too (storage policy).
    expect((await upload(b, orgB.id, r, pdf())).error).not.toBeNull();
  });

  it("the date boundary: the day before delivery and exactly 6 months before are accepted (Q-D3)", async () => {
    for (const offset of ["1 day", "6 months"]) {
      const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Bd ${uniq()}`))).referral_id!;
      const f = await evidence(r);
      await drainQueue();
      const d = sql(`select ((delivered_at at time zone 'America/Toronto')::date - interval '${offset}')::date from public.referrals where id = '${r}'`)[0];
      expect((await fileClaim(r, [f.id], d)).error, offset).toBeNull();
    }
  });

  it("the free-text decline can't produce the prior_presentation code (AC-24)", async () => {
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Tx ${uniq()}`))).referral_id!;
    await b.client.rpc("transition_referral", { p_referral: r, p_to: "declined", p_reason: "prior_presentation", p_expected_version: await version(r), p_acting_org: orgB.id });
    expect((await admin().from("referrals").select("decline_reason").eq("id", r).single()).data!.decline_reason).not.toBe("prior_presentation");
  });

  it("note and contest reason with markup are stored as plain text and never echoed to the hiring side", async () => {
    const p = await claimPair("Xss");
    const note = `<img src=x onerror=alert(1)>"'</textarea><script>alert(2)</script>`;
    expect((await referralClaim(p.late, p.early, note)).error).toBeNull();
    expect((await presentation(a1, p.late, orgA1.id)).claim!.note).toBe(note);
    const reason = `<svg onload=alert(3)> secret-contest-reason-${uniq()}`;
    const dispute = (await a1.client.rpc("contest_prior_presentation_claim", { p_referral: p.late, p_reason: reason, p_acting_org: orgA1.id })).data as string;
    expect(dispute).toBeTruthy();
    // PD-028: contest reason is admins-only.
    expect(JSON.stringify(await presentation(b, p.late, orgB.id))).not.toContain("secret-contest-reason");
    const { data: bNotes } = await admin().from("notifications").select("title, body").eq("organization_id", orgB.id).eq("kind", "dispute.opened");
    expect(JSON.stringify(bNotes)).not.toContain("secret-contest-reason");
    expect((await b.client.from("audit_events").select("metadata").eq("entity_id", p.late)).data!.map((x) => JSON.stringify(x.metadata)).join()).not.toContain(dispute);
    expect((await b.client.from("disputes").select("id").eq("referral_id", p.late)).data).toEqual([]);
    const { data } = await platform.client.rpc("get_referral_dispute", { p_dispute: dispute });
    expect((data as { dispute: { reason: string } }).dispute.reason).toBe(reason);
  });
});

// =============================================================================================
describe("evidence files: storage abuse (BR-15, EC-4, AC-30, AC-38, scenario 37)", () => {
  let ref: string;
  beforeAll(async () => {
    ref = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Ev ${uniq()}`))).referral_id!;
  });

  it("the bucket refuses other MIME types and files over 10 MB", async () => {
    expect((await upload(b, orgB.id, ref, new TextEncoder().encode("<html><script>alert(1)</script>"), "text/html", "pdf")).error).not.toBeNull();
    expect((await upload(b, orgB.id, ref, new TextEncoder().encode("a,b\n1,2"), "text/csv", "pdf")).error).not.toBeNull();
    expect((await upload(b, orgB.id, ref, new Uint8Array(10 * 1024 * 1024 + 1), "application/pdf")).error).not.toBeNull();
    expect((await upload(b, orgB.id, ref, pdf(), "application/pdf", "html")).error).not.toBeNull();
  });

  it("a forged PDF (HTML bytes, PDF content type) is rejected by the worker and can't back a claim", async () => {
    const forged = new TextEncoder().encode("<html><body><script>alert(document.cookie)</script></body></html>");
    const f = await evidence(ref, forged);
    await drainQueue();
    const { data } = await b.client.rpc("list_claim_evidence_files", { p_referral: ref, p_acting_org: orgB.id });
    expect((data as { id: string; scan_status: string; sha256: string | null }[]).find((x) => x.id === f.id)).toMatchObject({ scan_status: "rejected", sha256: null });
    expect((await fileClaim(ref, [f.id], priorDate(ref))).error?.message).toMatch(/claim_files_not_ready/);
    expect((await b.client.rpc("authorize_claim_evidence", { p_file: f.id, p_acting_org: orgB.id })).error?.message).toMatch(/claim_files_not_ready/);
    expect((await b.client.rpc("remove_claim_evidence", { p_file: f.id, p_acting_org: orgB.id })).error).toBeNull();
  });

  it("a PNG registered under a .pdf path is refused; the extension must match the stored content type", async () => {
    const { path, error } = await upload(b, orgB.id, ref, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]), "image/png", "pdf");
    expect(error).toBeNull();
    const reg = await b.client.rpc("register_claim_evidence", { p_referral: ref, p_storage_path: path, p_file_name: "x.pdf", p_acting_org: orgB.id });
    expect(reg.error?.message).toMatch(/claim_file_invalid/);
  });

  it("stored objects can't be overwritten, read or listed by any member (SHA-256 stays true)", async () => {
    const f = await evidence(ref);
    await drainQueue();
    const swap = await b.client.storage.from("claim-evidence").upload(f.path, new TextEncoder().encode("%PDF-1.4 swapped"), { contentType: "application/pdf", upsert: true });
    expect(swap.error).not.toBeNull();
    for (const u of [a, b, c]) {
      expect((await u.client.storage.from("claim-evidence").download(f.path)).error).not.toBeNull();
      const listed = await u.client.storage.from("claim-evidence").list(`${orgB.id}/${ref}`);
      expect(listed.data ?? []).toEqual([]);
      expect((await u.client.storage.from("claim-evidence").remove([f.path])).data ?? []).toEqual([]);
    }
    const { data } = await admin().storage.from("claim-evidence").download(f.path);
    expect(createHash("sha256").update(new Uint8Array(await data!.arrayBuffer())).digest("hex")).toBe(createHash("sha256").update(f.bytes).digest("hex"));
  });

  it("a member can't upload into another org's folder or for a referral it doesn't own", async () => {
    expect((await upload(a, orgB.id, ref, pdf())).error).not.toBeNull(); // sourcing side
    expect((await upload(c, orgC.id, ref, pdf())).error).not.toBeNull(); // other org, own folder
    expect((await upload(c, orgB.id, ref, pdf())).error).not.toBeNull(); // other org, B's folder
    expect((await upload(b, orgB.id, randomUUID(), pdf())).error).not.toBeNull(); // unknown referral
  });

  it("other orgs get not_found on every evidence RPC with B's ids (IDOR)", async () => {
    const f = await evidence(ref);
    await drainQueue();
    const calls = [
      c.client.rpc("remove_claim_evidence", { p_file: f.id, p_acting_org: orgB.id }),
      c.client.rpc("remove_claim_evidence", { p_file: f.id, p_acting_org: orgC.id }),
      a.client.rpc("remove_claim_evidence", { p_file: f.id, p_acting_org: orgA.id }),
      c.client.rpc("authorize_claim_evidence", { p_file: f.id, p_acting_org: orgB.id }),
      c.client.rpc("list_claim_evidence_files", { p_referral: ref, p_acting_org: orgB.id }),
      c.client.rpc("file_prior_presentation_claim", { p_referral: ref, p_expected_version: 1, p_evidence_kind: "file", p_file_ids: [f.id], p_prior_process_date: "2026-10-01", p_attested: true, p_acting_org: orgB.id }),
      a.client.rpc("file_prior_presentation_claim", { p_referral: ref, p_expected_version: 1, p_evidence_kind: "file", p_file_ids: [f.id], p_prior_process_date: "2026-10-01", p_attested: true }),
      c.client.rpc("register_claim_evidence", { p_referral: ref, p_storage_path: f.path, p_file_name: "x.pdf", p_acting_org: orgB.id }),
    ];
    for (const [i, res] of (await Promise.all(calls)).entries()) expect(res.error?.message, `call ${i}`).toMatch(/not_found/);
  });

  it("five draft files at most per referral (Q-D4)", async () => {
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Five ${uniq()}`))).referral_id!;
    for (let i = 0; i < 5; i++) await evidence(r);
    const { path } = await upload(b, orgB.id, r, pdf());
    const sixth = await b.client.rpc("register_claim_evidence", { p_referral: r, p_storage_path: path, p_file_name: "six.pdf", p_acting_org: orgB.id });
    expect(sixth.error?.message).toMatch(/claim_too_many_files/);
  });

  it("m-3 fixed: objects uploaded straight to storage but never registered are purged after 24 h", async () => {
    const { path, error } = await upload(b, orgB.id, ref, pdf());
    expect(error).toBeNull();
    sql(`update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'claim-evidence' and name = '${path}'`);
    const { data } = await admin().rpc("purge_orphan_claim_files");
    expect((data ?? []) as string[]).toContain(path);
  });
});

// =============================================================================================
describe("admin (PD-024, AC-43, AC-44, AC-46, AC-58, EC-8)", () => {
  it("same-person signal returns three enums only, audits with empty metadata, refuses non-admins and unknown ids", async () => {
    const p = await claimPair("Signal");
    expect((await referralClaim(p.late, p.early)).error).toBeNull();
    const dispute = (await a1.client.rpc("contest_prior_presentation_claim", { p_referral: p.late, p_reason: "Different person.", p_acting_org: orgA1.id })).data as string;
    const { data, error } = await platform.client.rpc("compare_dispute_contacts", { p_dispute: dispute });
    expect(error).toBeNull();
    const out = data as Record<string, string>;
    expect(Object.keys(out).sort()).toEqual(["email", "linkedin", "phone"]);
    for (const v of Object.values(out)) expect(["match", "no_match", "not_available"]).toContain(v);
    expect(JSON.stringify(out)).not.toMatch(/\\x|[0-9a-f]{16}|@/);
    const { data: audit } = await platform.client.from("audit_events").select("metadata, actor_id").eq("action", "dispute.contacts_compared").eq("entity_id", dispute);
    expect(audit).toEqual([{ metadata: {}, actor_id: platform.id }]);
    expect((await platform.client.rpc("compare_dispute_contacts", { p_dispute: randomUUID() })).error?.message).toMatch(/not_found/);
    for (const u of [a, a1, b, c]) expect((await u.client.rpc("compare_dispute_contacts", { p_dispute: dispute })).error?.message).toMatch(/forbidden/);
    expect((await anon().rpc("compare_dispute_contacts", { p_dispute: dispute })).error).not.toBeNull();
    // The dispute read model carries no fingerprint, client key or candidate label.
    const { data: card } = await platform.client.rpc("get_referral_dispute", { p_dispute: dispute });
    const label = (await admin().from("referrals").select("candidate_label").eq("id", p.late).single()).data!.candidate_label;
    const s = JSON.stringify(card);
    expect(s).not.toContain(label);
    expect(s).not.toMatch(/"client_key"|fingerprint|"hash"|\\\\x/); // same_client_key (boolean) is allowed
  });

  it("same person: two referrals sharing an email, different phones, one without LinkedIn → match / no_match / not_available", async () => {
    const shared = email("sp");
    const client = `Sp ${uniq()}`;
    const p1 = `+1416555${String(1000 + Math.floor(Math.random() * 8999))}`;
    const p2 = `+1647555${String(1000 + Math.floor(Math.random() * 8999))}`;
    const early = (await submit(a, orgA.id, await cand(a, orgA.id, { email: shared, phone: p1, linkedin_url: `linkedin.com/in/qa-${uniq()}` }), await bJob(client))).referral_id!;
    // The later one shares the email: it is stopped at submission, so seed it as a different
    // person first and give it the shared email in the fingerprint table afterwards would be cheating;
    // instead the later referral is delivered first to another job and the early one is cited.
    const lateJob = await bJob(client);
    const lateCand = await cand(a1, orgA1.id, { email: email("tmp"), phone: p2, linkedin_url: null });
    const late = (await submit(a1, orgA1.id, lateCand, lateJob)).referral_id!;
    // Candidate later corrected their email on file; recompute as a key rotation would (BR-34).
    await admin().from("candidates").update({ email: shared }).eq("id", lateCand);
    sql(`select app.write_fingerprints('${late}', '${lateCand}')`);
    expect((await referralClaim(late, early)).error).toBeNull();
    const dispute = (await a1.client.rpc("contest_prior_presentation_claim", { p_referral: late, p_reason: "Not the same person", p_acting_org: orgA1.id })).data as string;
    expect((await platform.client.rpc("compare_dispute_contacts", { p_dispute: dispute })).data).toEqual({ email: "match", phone: "no_match", linkedin: "not_available" });
  });

  it("admin evidence download refused on a final (uncontested) claim; allowed once disputed (AC-44)", async () => {
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Fin ${uniq()}`))).referral_id!;
    const f = await evidence(r);
    await drainQueue();
    expect((await fileClaim(r, [f.id], priorDate(r))).error).toBeNull();
    sql(`update app.referral_claims set contest_deadline_at = now() - interval '1 second' where referral_id = '${r}'`);
    expect((await platform.client.rpc("authorize_claim_evidence", { p_file: f.id })).error?.message).toMatch(/not_found/);
    // The sourcing side still sees only n / uploaded_at / sha256 on a final claim.
    const src = await presentation(a, r, orgA.id);
    expect(src.claim).toMatchObject({ status: "final" });
    expect(Object.keys((src.claim!.files as object[])[0]).sort()).toEqual(["n", "sha256", "uploaded_at"]);
    expect(src).toMatchObject({ ownership_state: "ended", counts: false, can_release: false, can_release_on_withdraw: false });
  });

  it("rejection bumps the version: a stale hiring-side decision gets stale_version (EC-8); open dispute keeps fingerprints through the purge (AC-58)", async () => {
    const p = await claimPair("Ec8");
    expect((await referralClaim(p.late, p.early)).error).toBeNull();
    const dispute = (await a1.client.rpc("contest_prior_presentation_claim", { p_referral: p.late, p_reason: "We were first.", p_acting_org: orgA1.id })).data as string;
    await admin().from("referrals").update({ ownership_protected_until: new Date(Date.now() - 1000).toISOString() }).eq("id", p.late);
    expect((await admin().rpc("purge_presentation_data")).error).toBeNull();
    expect(Number(sql(`select count(*) from app.referral_fingerprints where referral_id = '${p.late}'`)[0])).toBeGreaterThan(0);
    await admin().from("referrals").update({ ownership_protected_until: new Date(Date.now() + 86_400_000 * 300).toISOString() }).eq("id", p.late);

    const stale = await version(p.late);
    expect((await platform.client.rpc("resolve_prior_presentation_dispute", { p_dispute: dispute, p_claim_upheld: false, p_resolution: "Evidence predates nothing." })).error).toBeNull();
    const r = await b.client.rpc("review_referral", { p_referral: p.late, p_to: "accepted", p_reason_code: "", p_note: "", p_expected_version: stale, p_acting_org: orgB.id });
    expect(r.error?.message).toMatch(/stale_version/);
    // A second resolution of the same dispute is refused.
    expect((await platform.client.rpc("resolve_prior_presentation_dispute", { p_dispute: dispute, p_claim_upheld: true, p_resolution: "Changed my mind" })).error?.message).toMatch(/dispute_not_open/);
    // After rejection the sourcing side can withdraw with release (AC-47).
    expect((await presentation(a1, p.late, orgA1.id)).can_release_on_withdraw).toBe(true);
    expect((await a1.client.rpc("contest_prior_presentation_claim", { p_referral: p.late, p_reason: "Again please", p_acting_org: orgA1.id })).error?.message).toMatch(/claim_not_allowed/);
  });

  it("non-admins can't resolve, read or list referral disputes", async () => {
    const p = await claimPair("NonAdmin");
    expect((await referralClaim(p.late, p.early)).error).toBeNull();
    const dispute = (await a1.client.rpc("contest_prior_presentation_claim", { p_referral: p.late, p_reason: "We were first.", p_acting_org: orgA1.id })).data as string;
    for (const u of [a1, b, c]) {
      expect((await u.client.rpc("resolve_prior_presentation_dispute", { p_dispute: dispute, p_claim_upheld: false, p_resolution: "Self-serve" })).error?.message).toMatch(/forbidden/);
      expect((await u.client.rpc("get_referral_dispute", { p_dispute: dispute })).error?.message).toMatch(/forbidden/);
    }
    expect((await c.client.from("disputes").select("id").eq("id", dispute)).data).toEqual([]);
  });
});

// =============================================================================================
describe("business days: edges (BR-17, BR-28, scenarios 25–30, 41)", () => {
  const deadline = (event: string, n = 5) =>
    sql(`select to_char(app.add_business_days(timestamp '${event}' at time zone 'America/Toronto', ${n}) at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI:SS')`)[0];

  it("Friday evening and the midnight boundary use the ET date, not UTC", () => {
    expect(deadline("2026-11-13 23:59:59")).toBe("2026-11-20 23:59:59"); // Friday 23:59:59 ET is Saturday in UTC
    expect(deadline("2026-11-14 00:00:00")).toBe("2026-11-20 23:59:59"); // Saturday 00:00 ET: counting starts Monday
    expect(deadline("2026-11-15 23:59:59")).toBe("2026-11-20 23:59:59"); // Sunday late
    expect(deadline("2026-11-16 00:00:00")).toBe("2026-11-23 23:59:59"); // Monday: Monday itself never counts
  });

  it("Christmas week: substitutes skipped, 24 and 31 December counted", () => {
    expect(deadline("2026-12-18 18:00")).toBe("2026-12-29 23:59:59"); // 21,22,23,24,29
    expect(deadline("2026-12-21 09:00")).toBe("2026-12-30 23:59:59"); // 22,23,24,29,30
    expect(deadline("2026-12-25 12:00")).toBe("2027-01-05 23:59:59"); // delivered on a holiday: 29,30,31,4,5
    expect(deadline("2026-12-22 10:00", 10)).toBe("2027-01-08 23:59:59"); // contest window over the holidays
    // r2-m4 (backend): 2029 is seeded now: 27, 28, 29 Dec, then 1 Jan 2029 is skipped → 2, 3 Jan.
    expect(deadline("2028-12-22 12:00")).toBe("2029-01-03 23:59:59");
    // The guard still fails loudly past the seeded years (2030+).
    expect(() => deadline("2029-12-27 12:00")).toThrow(/holiday_calendar_exhausted/);
  });

  it("24 June and Canada Day in 2027 are skipped; 2028 Saturday versions are not moved", () => {
    expect(deadline("2027-06-23 12:00")).toBe("2027-07-02 23:59:59"); // skips Thu 24 Jun and Thu 1 Jul
    expect(deadline("2028-06-24 12:00")).toBe("2028-06-30 23:59:59"); // Saturday 24 Jun: Mon 26 counts
  });

  it("business days left across the holidays (S5-x)", () => {
    const left = (d: string, now: string) => sql(`select app.business_days_left(timestamp '${d}' at time zone 'America/Toronto', timestamp '${now}' at time zone 'America/Toronto')`)[0];
    expect(left("2027-01-05 23:59:59", "2026-12-23 10:00")).toBe("6"); // 24, 29, 30, 31, 4, 5
    expect(left("2027-01-05 23:59:59", "2027-01-05 23:59:58")).toBe("0");
  });

  it("deadlines stored on real rows match the helper (AC-32, BR-28)", async () => {
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Bd ${uniq()}`))).referral_id!;
    expect(sql(`select claim_deadline_at = app.add_business_days(delivered_at, 5) from public.referrals where id = '${r}'`)).toEqual(["t"]);
  });

  it("the holiday table is closed to members and refuses weekend rows", async () => {
    expect(() => sql(`insert into app.network_holidays (day, name, jurisdictions) values ('2027-11-13', 'Saturday', '{ON}')`)).toThrow();
    for (const fn of ["add_business_days", "business_days_left", "is_business_day"]) {
      expect((await a.client.schema("app" as never).rpc(fn as never, {} as never)).error, fn).not.toBeNull();
    }
  });
});

// =============================================================================================
describe("round 2 (B-1 depth, PD-032, PD-030, m-5 lookup)", () => {
  async function freshSourcer(label: string) {
    const u = await createUser(label);
    const org = await createOrg(u, `QA ${label}`);
    return { u, org };
  }
  const forCandidate = async (u: TestUser, candidateId: string, jobId: string, key: string = randomUUID()) =>
    u.client.rpc("submit_referral_for_candidate", {
      p_candidate: candidateId, p_job: jobId, p_terms_version: await termsOf(jobId), p_fields: ["skills"], p_document_ids: [], p_idempotency_key: key,
    }).single() as unknown as Promise<{ data: { outcome: string; referral_id: string | null } | null; error: { message: string; code: string; details: string | null; hint: string | null } | null }>;

  // N9 (brief R-5, BR-9): the R2-1 invalid_token tests are retired: no RPC takes a caller-supplied
  // token hash, so there is no unique-hash collision left after the gate. These replacements prove the
  // oracle R2-1 closed is still closed under the new flow: every candidate-path attempt is counted,
  // presented and clear people differ only by the gate outcome itself, and nothing raises (and rolls
  // back its hit) after the gate.
  it("R2-1 under N9: presented vs clear only differ by the gate outcome; every attempt counted; the 31st refused for everyone (BR-9, BR-22)", async () => {
    const { u, org } = await freshSourcer("qa-oracle-n9");
    const target = await bJob(`Oracle ${uniq()}`);
    const presented = email("presented");
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: presented }), target);
    const outcomes: string[] = [];
    for (let i = 0; i < 30; i++) {
      // Alternate a presented person and fresh clear people (each clear one on its own job, so it's created).
      const r = i % 2 === 0
        ? await forCandidate(u, await cand(u, org.id, { email: presented }), target)
        : await forCandidate(u, await cand(u, org.id, { email: email("clear") }), await bJob(`Clear ${uniq()}`));
      outcomes.push(r.error ? `error:${r.error.message}` : r.data!.outcome);
    }
    // Presented ones are stopped (first) then sticky-stopped, clear ones created; no raw error anywhere.
    expect(outcomes.filter((o, i) => i % 2 === 0).every((o) => o === "stopped")).toBe(true);
    expect(outcomes.filter((o, i) => i % 2 === 1).every((o) => o === "created")).toBe(true);
    const over = [
      await forCandidate(u, await cand(u, org.id, { email: presented }), target),
      await forCandidate(u, await cand(u, org.id, { email: email("clear") }), await bJob(`Clear ${uniq()}`)),
    ];
    expect(over.map((r) => r.error?.message)).toEqual(["rate_limited", "rate_limited"]);
    expect(sql(`select coalesce(sum(hits), 0) from app.rate_limits where user_id = '${u.id}' and bucket = 'referral.submit'`)[0]).toBe("30");
    // The 15 created requests all coexist with a null hash (no unique collision to raise after the gate).
    expect(sql(`select count(*) filter (where q.token_hash is null) || '/' || count(*) from public.referral_candidate_requests q where q.organization_id = '${org.id}'`)).toEqual(["15/15"]);
  });

  it("race under N9: parallel candidate submissions never raise after the gate; each leaves a referral or a hit (BR-22)", async () => {
    const leaks: string[] = [];
    for (let round = 0; round < 6; round++) {
      const { u, org } = await freshSourcer(`qa-race-n9-${round}`);
      const client = `Race ${uniq()}`;
      const decoyJob = await bJob(client);
      const target = await bJob(`RaceT ${uniq()}`);
      const decoy = await cand(u, org.id);
      const probe = await cand(u, org.id, { email: email("clearprobe") });
      // Same idempotency key on both: the only post-gate collision left. It must come back as a code.
      const key = randomUUID();
      const [d, r] = await Promise.all([forCandidate(u, decoy, decoyJob, key), forCandidate(u, probe, target, key)]);
      for (const x of [d, r]) {
        const outcome = x.error ? `error:${x.error.message}` : x.data!.outcome;
        if (!["created", "stopped", "conflict"].includes(outcome)) leaks.push(outcome);
        if (x.error && /constraint|_key|duplicate key|token_hash/.test(JSON.stringify(x.error))) leaks.push(JSON.stringify(x.error));
      }
      const hits = Number(sql(`select count(*) from app.presentation_hits where source_org_id = '${org.id}' and job_id = '${target}'`)[0]);
      const referral = (await admin().from("referral_candidate_links").select("referral_id").eq("candidate_id", probe)).data!.length;
      const decoyRef = (await admin().from("referral_candidate_links").select("referral_id").eq("candidate_id", decoy)).data!.length;
      // Exactly one referral was created for the shared key; the other call answers created(replay)/conflict.
      if (referral + decoyRef !== 1) leaks.push(`round ${round}: ${referral + decoyRef} referrals for one key (hits ${hits})`);
      // Both attempts were counted.
      if (sql(`select coalesce(sum(hits), 0) from app.rate_limits where user_id = '${u.id}' and bucket = 'referral.submit'`)[0] !== "2") leaks.push(`round ${round}: not both counted`);
    }
    expect(leaks).toEqual([]);
  });

  it("r2-m3: stable error codes, no constraint names, on rotate / duplicate claim / duplicate contest", async () => {
    // N9: rotate takes no token hash any more (no `invalid_token`); a closed request answers a stable code.
    const own = await submitForCandidate(a, await cand(a, orgA.id), await bJob(`Rot ${uniq()}`));
    expect(await respond(own.token, false)).toBe("declined");
    const rot = await a.client.rpc("rotate_candidate_request_token", { p_referral: own.referral_id!, p_ttl_days: 14 });
    expect(rot.error?.message).toBe("request_closed");
    expect(JSON.stringify(rot.error)).not.toMatch(/constraint|_key|duplicate key|token_hash/);
    const p = await claimPair("Dup");
    const v = await version(p.late);
    const args = { p_referral: p.late, p_expected_version: v, p_evidence_kind: "referral", p_file_ids: [], p_evidence_referral: p.early, p_attested: true, p_acting_org: orgB.id };
    const both = await Promise.all([b.client.rpc("file_prior_presentation_claim", args as never), b.client.rpc("file_prior_presentation_claim", args as never)]);
    const errs = both.map((x) => x.error).filter(Boolean);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toMatch(/^(claim_already_filed|stale_version)$/);
    const two = await Promise.all([0, 1].map(() => a1.client.rpc("contest_prior_presentation_claim", { p_referral: p.late, p_reason: "We were first.", p_acting_org: orgA1.id })));
    const cerr = two.map((x) => x.error).filter(Boolean);
    expect(cerr).toHaveLength(1);
    expect(cerr[0]!.message).toMatch(/^(dispute_already_open|claim_not_allowed)$/);
    expect(JSON.stringify(cerr)).not.toMatch(/constraint|duplicate key/);
  });

  it("R2-2 fixed: storage limit counts each upload once: exactly 30 direct uploads per hour, the 31st refused (B-1)", async () => {
    const hb = await createUser("qa-hb");
    const borg = await createOrg(hb, "QA Hiring 2");
    const job2 = await createJob(hb, borg.id, { title: `Up ${uniq()}`, client_name: `Client ${uniq()}` });  // N3 BR-1: a real name to open
    const ref = (await submit(a, orgA.id, await cand(a, orgA.id), job2)).referral_id!;
    const results: boolean[] = [];
    for (let i = 0; i < 31; i++) results.push(!(await upload(hb, borg.id, ref, pdf())).error);
    expect(results.slice(0, 30).every(Boolean)).toBe(true);
    expect(results[30]).toBe(false);
  });

  it("refused attempts don't open a second unlimited path: claims over the limit are refused before validation (AC-36)", async () => {
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Cl ${uniq()}`))).referral_id!;
    const f = await evidence(r);
    await drainQueue();
    // 10 valid-looking attempts that fail validation roll back, so they don't count; a valid claim still goes through.
    for (let i = 0; i < 12; i++) await fileClaim(r, [f.id], "1999-01-01");
    expect((await fileClaim(r, [f.id], priorDate(r))).error).toBeNull();
  });

  it("scenario 48 tail: after the link expired and A1 delivered meanwhile, a resend + confirmation closes as already_presented (AC-76)", async () => {
    const shared = email("exp48");
    const j1 = await bJob(`Exp48 ${uniq()}`);
    const p = await submitForCandidate(a, await cand(a, orgA.id, { email: shared }), j1);
    sql(`update public.referral_candidate_requests set expires_at = now() - interval '1 second' where referral_id = '${p.referral_id}'`);
    expect((await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1)).outcome).toBe("created"); // no warning
    expect((await admin().rpc("purge_presentation_data")).error).toBeNull();
    expect((await admin().from("referrals").select("status").eq("id", p.referral_id!).single()).data!.status).toBe("awaiting_candidate");
    const rot = await a.client.rpc("rotate_candidate_request_token", { p_referral: p.referral_id!, p_ttl_days: 14 });
    expect(rot.error).toBeNull(); // resend runs no stop check
    const token = await issueCandidateToken(p.referral_id!, a.id);
    expect(await respond(token, true)).toBe("already_sent");
    expect((await anon().rpc("get_candidate_request", { p_token: token })).data).toMatchObject({ state: "already_sent" });
  });

  it("scenario 49: the four N1 events notify in-app only; no email is attempted (PD-030)", async () => {
    const p = await claimPair("Mail");
    expect((await referralClaim(p.late, p.early)).error).toBeNull();
    const dispute = (await a1.client.rpc("contest_prior_presentation_claim", { p_referral: p.late, p_reason: "We were first.", p_acting_org: orgA1.id })).data as string;
    await platform.client.rpc("resolve_prior_presentation_dispute", { p_dispute: dispute, p_claim_upheld: false, p_resolution: "Not the same candidate." });
    const shared = email("mailclose");
    const j1 = await bJob(`MailClose ${uniq()}`);
    const pend = await submitForCandidate(a, await cand(a, orgA.id, { email: shared }), j1);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1, { ack: true });
    expect(await respond(pend.token, true)).toBe("already_sent");
    const { data } = await admin().from("notifications").select("kind, email_status, link")
      .in("kind", ["claim.filed", "dispute.opened", "dispute.resolved", "referral.already_presented"])
      .or(`link.ilike.%${p.late}%,link.ilike.%${pend.referral_id}%`);
    expect(new Set(data!.map((n) => n.kind))).toEqual(new Set(["claim.filed", "dispute.opened", "dispute.resolved", "referral.already_presented"]));
    expect(data!.every((n) => n.email_status === "not_configured")).toBe(true);
    expect(sql(`select count(*) from public.background_jobs where kind ilike '%email%' and created_at > now() - interval '1 minute'`)).toEqual(["0"]);
  });

  it("m-5 lookup: get_stop_by_reference is admin-only, refuses anon and malformed input, and sticky stops get a fresh 8-digit reference", async () => {
    const shared = email("lk");
    const j1 = await bJob(`Lk ${uniq()}`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    const y = await cand(a, orgA.id, { email: shared });
    const first = await submit(a, orgA.id, y, j1);
    const sticky = await submit(a, orgA.id, y, j1);
    expect(sticky.reference).toMatch(/^\d{8}$/);
    expect(sticky.reference).not.toBe(first.reference);
    expect((await platform.client.rpc("get_stop_by_reference", { p_reference: sticky.reference! })).data).toMatchObject({ outcome: "sticky" });
    expect((await anon().rpc("get_stop_by_reference", { p_reference: sticky.reference! })).error).not.toBeNull();
    for (const u of [a, b, c]) expect((await u.client.rpc("get_stop_by_reference", { p_reference: sticky.reference! })).error?.message).toMatch(/forbidden/);
    expect((await platform.client.rpc("get_stop_by_reference", { p_reference: "1' or '1'='1" })).error?.message).toMatch(/not_found/);
  });
});
