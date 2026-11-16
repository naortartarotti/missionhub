import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileClaimRpcArgs, fileClaimSchema } from "@/features/referrals/schemas";
import { admin, anon, createCandidate, createJob, createOrg, createUser, drainQueue, issueCandidateToken, sharingConsent, sql, termsOf, type TestUser } from "./helpers";

/**
 * N1 duplicate and prior-presentation protection (docs/specs/duplicate-prior-presentation).
 * A / A1 = sourcing orgs, B = hiring org, C = another hiring org, "B Sister" shares a member with B
 * (internal referrals). Every test uses its own candidates and jobs, so the fingerprints of one
 * test never reach another.
 */

let a: TestUser, a1: TestUser, b: TestUser, c: TestUser, platform: TestUser;
let orgA: { id: string }, orgA1: { id: string }, orgB: { id: string }, orgC: { id: string }, sister: { id: string };

const uniq = () => randomUUID().slice(0, 8);
const email = (tag: string) => `${tag}-${uniq()}@example.com`;
const bJob = (client: string | null) => createJob(b, orgB.id, { title: `Role ${uniq()}`, client_name: client, client_confidential: true });

type Outcome = { outcome: string; referral_id: string | null; reference: string | null };

async function cand(u: TestUser, orgId: string, over: Record<string, unknown> = {}) {
  return createCandidate(u, orgId, { email: email("cand"), ...over });
}

/** Recorded-authorization path. `newConsent` lets the RPC record the authorization itself. */
async function submit(u: TestUser, orgId: string, candidateId: string, jobId: string, opts: { ack?: boolean; newConsent?: boolean } = {}) {
  const consent = opts.newConsent ? null : await sharingConsent(u, orgId, candidateId, jobId);
  const { data, error } = await u.client
    .rpc("submit_referral", {
      p_candidate: candidateId,
      p_job: jobId, p_terms_version: await termsOf(jobId),
      p_fields: ["headline", "skills"],
      p_document_ids: [],
      p_consent: consent as string,
      p_idempotency_key: randomUUID(),
      p_acknowledge_pending: opts.ack ?? false,
      p_new_consent: opts.newConsent ? { legal_basis: "consent", scope: "Share with partner", evidence: "Email from candidate" } : undefined,
    })
    .single();
  if (error) throw new Error(error.message);
  return data as Outcome;
}

/**
 * Candidate-confirmed path: returns the outcome and the raw token for the candidate's page.
 * N9: the token is the real server-issued one (service-role issuance, as the Server Action does).
 */
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

const confirm = async (token: string, profile: Record<string, unknown> = {}) => {
  const { data, error } = await anon().rpc("respond_candidate_request", { p_token: token, p_accept: true, p_profile: profile as never });
  if (error) throw new Error(error.message);
  return data as string;
};

async function version(referralId: string) {
  const { data } = await admin().from("referrals").select("version").eq("id", referralId).single();
  return data!.version;
}

async function presentation(u: TestUser, referralId: string, orgId: string) {
  const { data, error } = await u.client.rpc("get_referral_presentation", { p_referral: referralId, p_acting_org: orgId });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> & { claim: Record<string, unknown> | null };
}

const pdf = () => new TextEncoder().encode(`%PDF-1.4\n% evidence ${uniq()}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);

/** Uploads one evidence file as B, registers it and runs the worker scan. */
async function evidence(referralId: string, bytes = pdf()) {
  const path = `${orgB.id}/${referralId}/${randomUUID()}.pdf`;
  const up = await b.client.storage.from("claim-evidence").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await b.client.rpc("register_claim_evidence", { p_referral: referralId, p_storage_path: path, p_file_name: "ats-export.pdf", p_acting_org: orgB.id });
  if (error) throw new Error(error.message);
  return { id: (data as { id: string }).id, bytes, path };
}

const deliveredDate = async (referralId: string) =>
  sql(`select (delivered_at at time zone 'America/Toronto')::date from public.referrals where id = '${referralId}'`)[0];

beforeAll(async () => {
  [a, a1, b, c, platform] = await Promise.all([
    createUser("n1-a"), createUser("n1-a1"), createUser("n1-b"), createUser("n1-c"), createUser("n1-admin", { platformAdmin: true }),
  ]);
  orgA = await createOrg(a, "N1 Agency A");
  orgA1 = await createOrg(a1, "N1 Agency A1");
  orgB = await createOrg(b, "N1 Hiring B");
  orgC = await createOrg(c, "N1 Hiring C");
  sister = await createOrg(b, "N1 B Sister");
});

// The submission (30/h), objection (10/h), contest (5/h) and upload limits are enforced in the
// database (QA B-1). This file drives far more traffic than that through a few fixture users, so
// their windows are cleared before each test; the limits themselves are covered by the QA suite.
beforeEach(() => {
  sql(`delete from app.rate_limits where user_id in ('${a.id}', '${a1.id}', '${b.id}', '${c.id}', '${platform.id}')`);
});

// ---------------------------------------------------------------------------------------------
describe("submission check (BR-3, BR-6, BR-9, BR-23)", () => {
  it("stops a job-level hit: nothing created, sticky stop + audit persist (AC-1, EC-1)", async () => {
    const shared = email("x");
    const j1 = await bJob(`Acme ${uniq()}`);
    expect((await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1)).outcome).toBe("created");
    const notesBefore = (await b.client.from("notifications").select("id")).data!.length;

    const y = await cand(a, orgA.id, { email: shared.toUpperCase() });
    const r = await submit(a, orgA.id, y, j1, { newConsent: true });
    expect(r).toMatchObject({ outcome: "stopped", referral_id: null });
    expect(r.reference).toMatch(/^\d{1,8}$/);

    const { data: links } = await a.client.from("referral_candidate_links").select("referral_id").eq("candidate_id", y);
    expect(links).toHaveLength(0);
    const { data: consents } = await a.client.from("candidate_consents").select("id").eq("candidate_id", y).eq("kind", "job_sharing");
    expect(consents).toHaveLength(0); // the new authorization is only recorded after the check passes
    expect(sql(`select count(*) from app.sticky_stops where candidate_id = '${y}' and reason = 'stop'`)).toEqual(["1"]);
    expect((await b.client.from("notifications").select("id")).data!.length).toBe(notesBefore);

    const { data: audit } = await a.client.from("audit_events").select("action, metadata").eq("entity_id", j1).eq("action", "referral.submission_stopped");
    expect(audit).toHaveLength(1);
    expect(audit![0].metadata).toEqual({}); // member-visible: no scope, no identifiers
    const { data: platformAudit } = await platform.client.from("audit_events").select("metadata").is("organization_id", null).eq("entity_id", j1).eq("action", "referral.fingerprint_hit");
    expect(platformAudit![0].metadata).toMatchObject({ scope: "job", outcome: "stop" });
  });

  it("stops a client-level hit across the hiring org's jobs (AC-2, scenario 1)", async () => {
    const shared = email("x");
    const base = `Abc${uniq()}`;
    const j1 = await bJob(`${base} Inc.`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    for (const variant of [base.toLowerCase(), `${base.toUpperCase()} Corporation`, `${base}, Ltée`]) {
      const j2 = await bJob(variant);
      const r = await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j2);
      expect(r.outcome, variant).toBe("stopped");
    }
  });

  it("placeholders give no client key; the job scope still works (AC-3, scenario 2)", async () => {
    // N3 BR-1: a job can't open to partners without a real client name any more, so the keyless state (data from
    // before N3) is set after the fact, and the check itself is asked directly.
    for (const placeholder of ["confidentiel", "N/A", null]) expect(sql(`select coalesce(app.client_key(${placeholder === null ? "null" : `'${placeholder}'`}), '<null>')`)).toEqual(["<null>"]);
    const shared = email("x");
    const j1 = await bJob(`Keyless ${uniq()}`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    const others = [await bJob(`Keyless ${uniq()}`), await bJob(`Keyless ${uniq()}`)];
    for (const j of [j1, ...others]) {
      sql(`set session_replication_role = replica; update public.jobs set client_name = 'Confidential' where id = '${j}'; delete from app.job_client_keys where job_id = '${j}'`);
    }
    sql(`update app.referral_presentations set client_key = null where job_id = '${j1}'`);
    const y = await cand(a, orgA.id, { email: shared });
    for (const j of others) expect(sql(`select outcome from app.presentation_check('${y}', '${j}')`)).toEqual(["clear"]);
    expect(sql(`select outcome from app.presentation_check('${y}', '${j1}')`)).toEqual(["stop"]);
  });

  it("never matches across hiring orgs (AC-4, scenario 3)", async () => {
    const shared = email("x");
    const client = `Gamma ${uniq()}`;
    const jc = await createJob(c, orgC.id, { client_name: client });
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), jc);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), await bJob(client))).outcome).toBe("created");
  });

  it("every stop has the same payload shape: job, client, own org, sticky (AC-5, scenario 4)", async () => {
    const shared = email("x");
    const client = `Omega ${uniq()}`;
    const j1 = await bJob(client);
    const j2 = await bJob(client);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    const jobStop = await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1);
    const clientStop = await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j2);
    const ownOrgStop = await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j2);
    const y = await cand(a, orgA.id, { email: shared });
    await submit(a, orgA.id, y, j1);
    await admin().from("candidates").update({ email: email("changed") }).eq("id", y);
    const sticky = await submit(a, orgA.id, y, j1);
    for (const r of [jobStop, clientStop, ownOrgStop, sticky]) {
      expect(Object.keys(r).sort()).toEqual(["outcome", "reference", "referral_id"]);
      expect(r.outcome).toBe("stopped");
      expect(r.referral_id).toBeNull();
      expect(r.reference).toMatch(/^\d{1,8}$/);
    }
  });

  it("uses the client key snapshotted at delivery (AC-6, scenario 5)", async () => {
    const shared = email("x");
    const client = `Snap ${uniq()}`;
    const j1 = await bJob(client);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    await b.client.from("jobs").update({ client_name: `Renamed ${uniq()}` }).eq("id", j1);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), await bJob(client))).outcome).toBe("stopped");
  });

  it("normalises email, phone and LinkedIn before hashing (AC-7)", async () => {
    const tag = uniq();
    const area = 200 + Math.floor(Math.random() * 700);
    const phone = `(${area}) 555-0${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
    const j1 = await bJob(`Norm ${tag}`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, {
      email: ` Jane.Doe.${tag}@Example.com `, phone, location_country: "CA", linkedin_url: `https://www.linkedin.com/in/Jane-Doe-${tag}/?trk=x`,
    }), j1);
    const e164 = `+1${phone.replace(/\D/g, "")}`;
    const variants = [
      { email: `jane.doe.${tag}@example.com` },
      { email: `jane.doe.${tag}+agency@example.com` },
      { email: null, phone: e164, location_country: null },
      { email: null, linkedin_url: `linkedin.com/in/jane-doe-${tag}` },
    ];
    for (const v of variants) expect((await submit(a, orgA.id, await cand(a, orgA.id, v), j1)).outcome, JSON.stringify(v)).toBe("stopped");
  });

  it("an earlier outside presentation stops a later internal referral, and vice versa (BR-31, scenarios 39, 44, 45)", async () => {
    const outside = email("x");
    const j1 = await bJob(`Internal ${uniq()}`);
    await submit(a, orgA.id, await cand(a, orgA.id, { email: outside }), j1);
    const internalTry = await submit(b, sister.id, await cand(b, sister.id, { email: outside }), j1);
    expect(internalTry.outcome).toBe("stopped");

    const inside = email("y");
    const j2 = await bJob(`Internal ${uniq()}`);
    const first = await submit(b, sister.id, await cand(b, sister.id, { email: inside }), j2);
    const { data: ref } = await b.client.from("referrals").select("internal").eq("id", first.referral_id!).single();
    expect(ref!.internal).toBe(true);
    const outsideTry = await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: inside }), j2);
    expect(Object.keys(outsideTry).sort()).toEqual(Object.keys(internalTry).sort());
    expect(outsideTry.outcome).toBe("stopped");
    // PD-022: the attribute lives only in the admin-only hit log, never in audit metadata.
    expect(sql(`select earlier_internal from app.presentation_hits where source_org_id = '${orgA1.id}' and job_id = '${j2}' and outcome = 'stop'`)).toEqual(["t"]);
    const { data: audit } = await a1.client.from("audit_events").select("metadata");
    expect(JSON.stringify(audit)).not.toMatch(/internal/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("counting rule (BR-4, BR-5, BR-30, EC-2)", () => {
  it("withdrawn, cancelled and legacy duplicate declines keep stopping; outside the window they don't (AC-9, AC-10)", async () => {
    const shared = email("x");
    const j1 = await bJob(`Count ${uniq()}`);
    const first = await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    const w = await a1.client.rpc("withdraw_referral", { p_referral: first.referral_id!, p_reason: "Candidate paused", p_expected_version: await version(first.referral_id!), p_acting_org: orgA1.id });
    expect(w.error).toBeNull();
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1)).outcome).toBe("stopped");

    // Legacy `duplicate` decline (written before N1) still counts.
    await admin().from("referrals").update({ status: "declined", decline_reason: "duplicate" }).eq("id", first.referral_id!);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1)).outcome).toBe("stopped");

    await admin().from("referrals").update({ ownership_protected_until: new Date(Date.now() - 1000).toISOString() }).eq("id", first.referral_id!);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1)).outcome).toBe("created");
  });

  it("a referral withdrawn while awaiting the candidate never counts (scenario 33)", async () => {
    const shared = email("x");
    const j1 = await bJob(`Await ${uniq()}`);
    const pending = await submitForCandidate(a1, await cand(a1, orgA1.id, { email: shared }), j1);
    expect(pending.outcome).toBe("created");
    const w = await a1.client.rpc("withdraw_referral", { p_referral: pending.referral_id!, p_reason: "Wrong job", p_expected_version: await version(pending.referral_id!), p_acting_org: orgA1.id });
    expect(w.error).toBeNull();
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1)).outcome).toBe("created");
  });

  it("backfill invariant: every delivered referral has delivered_at and a frozen claim deadline (AC-54)", () => {
    expect(sql(`select count(*) from public.referrals r join public.referral_shared_profiles p on p.referral_id = r.id
                where r.delivered_at is null or r.claim_deadline_at is null`)).toEqual(["0"]);
    expect(sql(`select count(*) from public.referrals r where r.status = 'awaiting_candidate' and r.delivered_at is not null`)).toEqual(["0"]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("pending warning, delivery re-check and race (BR-5, BR-7, BR-8, EC-3)", () => {
  it("warns on a pending hit, creates on acknowledgement, and the loser closes as already presented (AC-8, AC-16)", async () => {
    const shared = email("x");
    const j1 = await bJob(`Pending ${uniq()}`);
    const pending = await submitForCandidate(a1, await cand(a1, orgA1.id, { email: shared }), j1);
    const y = await cand(a, orgA.id, { email: shared });

    const step1 = await submit(a, orgA.id, y, j1, { newConsent: true });
    expect(step1).toMatchObject({ outcome: "pending_warning", referral_id: null });
    expect((await a.client.from("referral_candidate_links").select("referral_id").eq("candidate_id", y)).data).toHaveLength(0);
    expect((await a.client.from("candidate_consents").select("id").eq("candidate_id", y).eq("kind", "job_sharing")).data).toHaveLength(0);

    const step2 = await submit(a, orgA.id, y, j1, { newConsent: true, ack: true });
    expect(step2.outcome).toBe("created");

    // A1's candidate confirms later: a presentation now exists, so A1's referral closes.
    expect(await confirm(pending.token)).toBe("already_sent");
    const { data: closed } = await a1.client.from("referrals").select("status, delivered_at").eq("id", pending.referral_id!).single();
    expect(closed).toMatchObject({ status: "already_presented", delivered_at: null });
    const { data: seen } = await b.client.from("referrals").select("id").eq("job_id", j1);
    expect(seen!.map((r) => r.id)).toEqual([step2.referral_id]);
    expect((await anon().rpc("get_candidate_request", { p_token: pending.token })).data).toMatchObject({ state: "already_sent" });
    expect(await confirm(pending.token)).toBe("already_sent"); // reopening shows the same state
    const { data: events } = await a1.client.from("referral_status_events").select("to_status, actor_kind").eq("referral_id", pending.referral_id!).eq("to_status", "already_presented");
    expect(events![0].actor_kind).toBe("system");
    const { data: notes } = await a1.client.from("notifications").select("kind").eq("kind", "referral.already_presented");
    expect(notes!.length).toBeGreaterThan(0);
  });

  it("closes on a phone edited on the confirmation page to match a presentation (AC-15, scenario 8)", async () => {
    const j1 = await bJob(`Recheck ${uniq()}`);
    const y = await cand(a, orgA.id, { email: email("y"), phone: null });
    const pending = await submitForCandidate(a, y, j1);
    expect(pending.outcome).toBe("created");
    const phone = `+1416555${String(1000 + Math.floor(Math.random() * 8999))}`;
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: email("x"), phone }), j1);

    expect(await confirm(pending.token, { phone })).toBe("already_sent");
    expect(sql(`select reason from app.sticky_stops where candidate_id = '${y}'`)).toEqual(["already_presented"]);
    const { data: hidden } = await b.client.from("referrals").select("id").eq("id", pending.referral_id!);
    expect(hidden).toHaveLength(0);
    const { data: bAudit } = await b.client.from("audit_events").select("id").eq("entity_id", pending.referral_id!);
    expect(bAudit).toHaveLength(0);
  });

  it("two parallel confirmations for two records of the same person deliver exactly one (AC-16, scenario 34)", async () => {
    const shared = email("race");
    const j1 = await bJob(`Race ${uniq()}`);
    const first = await submitForCandidate(a, await cand(a, orgA.id, { email: shared }), j1);
    const warn = await submitForCandidate(a1, await cand(a1, orgA1.id, { email: shared }), j1);
    expect(warn.outcome).toBe("pending_warning");
    const second = await submitForCandidate(a1, await cand(a1, orgA1.id, { email: shared }), j1, true);
    expect(second.outcome).toBe("created");

    const results = await Promise.all([confirm(first.token), confirm(second.token)]);
    expect(results.sort()).toEqual(["already_sent", "confirmed"]);
    const { data: seen } = await b.client.from("referrals").select("id").eq("job_id", j1);
    expect(seen).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("identifiers and sticky stops (BR-10, BR-24)", () => {
  it("refuses a submission without a usable identifier on both paths (AC-12, AC-13, scenario 6)", async () => {
    const j1 = await bJob(`Ident ${uniq()}`);
    const none = await cand(a, orgA.id, { email: null, phone: "123", linkedin_url: "not a url" });
    expect((await submit(a, orgA.id, none, j1, { newConsent: true })).outcome).toBe("identifier_required");
    expect((await a.client.from("candidate_consents").select("id").eq("candidate_id", none).eq("kind", "job_sharing")).data).toHaveLength(0);
    // Candidate path: no email is refused before the check (existing precondition).
    const r = await a.client.rpc("submit_referral_for_candidate", {
      p_candidate: none, p_job: j1, p_terms_version: await termsOf(j1), p_fields: ["skills"], p_document_ids: [], p_idempotency_key: randomUUID(),
    });
    expect(r.error?.message).toMatch(/candidate_email_missing/);
    const { data: audit } = await a.client.from("audit_events").select("action").eq("entity_id", j1);
    expect(audit!.map((x) => x.action)).toContain("referral.identifier_required");
  });

  it("sticky stop survives edited identifiers for the job and the client, then expires (AC-14, scenario 7)", async () => {
    const shared = email("s");
    const client = `Sigma ${uniq()}`;
    const j1 = await bJob(`${client} Inc`);
    const j2 = await bJob(client.toLowerCase());
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    const y = await cand(a, orgA.id, { email: shared });
    expect((await submit(a, orgA.id, y, j1)).outcome).toBe("stopped");

    await a.client.from("candidates").update({ email: null, phone: "+1 416 555 0199" }).eq("id", y);
    const again = await submit(a, orgA.id, y, j1);
    expect(again.outcome).toBe("stopped");
    expect(again.reference).toMatch(/^\d{1,8}$/);
    expect((await submit(a, orgA.id, y, j2)).outcome).toBe("stopped");
    const { data: platformAudit } = await platform.client.from("audit_events").select("action").eq("entity_id", j1).eq("action", "referral.sticky_stop");
    expect(platformAudit!.length).toBeGreaterThan(0);

    sql(`update app.sticky_stops set expires_at = now() - interval '1 second' where candidate_id = '${y}'`);
    expect((await submit(a, orgA.id, y, j1)).outcome).toBe("created");
  });
});

// ---------------------------------------------------------------------------------------------
describe("withdraw and release (BR-25, RD-019, PD-021)", () => {
  it("withdraw + release frees the candidate; the hiring side can't see the flag (AC-20, AC-23, scenario 13, 38)", async () => {
    const shared = email("rel");
    const j1 = await bJob(`Release ${uniq()}`);
    const first = await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1);
    const id = first.referral_id!;
    expect((await presentation(a, id, orgA.id)).can_release_on_withdraw).toBe(true);

    const w = await a.client.rpc("withdraw_referral", { p_referral: id, p_reason: "Candidate moved on", p_expected_version: await version(id), p_release: true, p_acting_org: orgA.id });
    expect(w.error).toBeNull();
    const source = await presentation(a, id, orgA.id);
    expect(source).toMatchObject({ ownership_state: "released", counts: false, can_release: false });
    expect(source.released_at).not.toBeNull();

    const target = await presentation(b, id, orgB.id);
    expect(Object.keys(target)).not.toContain("released_at");
    expect(target.ownership_state).toBe("protected");
    const { data: row } = await b.client.from("referrals").select("*").eq("id", id).single();
    expect(row!.status).toBe("withdrawn");
    expect(JSON.stringify(row)).not.toMatch(/releas/);
    const { data: bNotes } = await b.client.from("notifications").select("title").ilike("title", "%releas%");
    expect(bNotes).toHaveLength(0);

    expect((await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1)).outcome).toBe("created");
    expect((await a.client.rpc("release_referral", { p_referral: id, p_acting_org: orgA.id })).error?.message).toMatch(/release_not_allowed/);
  });

  it("release later on a cancelled referral; guards refuse the other cases (scenarios 42, 43)", async () => {
    const shared = email("later");
    const j1 = await bJob(`Later ${uniq()}`);
    const first = await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1);
    const id = first.referral_id!;
    expect((await b.client.rpc("review_referral", { p_referral: id, p_to: "accepted", p_reason_code: "", p_note: "", p_expected_version: await version(id), p_acting_org: orgB.id })).error).toBeNull();
    expect((await b.client.rpc("transition_referral", { p_referral: id, p_to: "cancelled", p_reason: "Role on hold", p_expected_version: await version(id), p_acting_org: orgB.id })).error).toBeNull();
    expect((await presentation(a, id, orgA.id)).can_release).toBe(true);

    // Hiring side and other orgs get "not found".
    expect((await b.client.rpc("release_referral", { p_referral: id, p_acting_org: orgB.id })).error?.message).toMatch(/not_found/);
    expect((await c.client.rpc("release_referral", { p_referral: id, p_acting_org: orgC.id })).error?.message).toMatch(/not_found/);
    expect((await a1.client.rpc("release_referral", { p_referral: id })).error?.message).toMatch(/not_found/);

    expect((await a.client.rpc("release_referral", { p_referral: id, p_acting_org: orgA.id })).error).toBeNull();
    expect((await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1)).outcome).toBe("created");
    const { data: audit } = await a.client.from("audit_events").select("action").eq("entity_id", id).eq("action", "referral.released");
    expect(audit).toHaveLength(1);
  });

  it("refuses release when never delivered, declined, outside the window, or claimed (scenario 43)", async () => {
    const j1 = await bJob(`Guard ${uniq()}`);
    // Never delivered: withdraw-with-release of an awaiting referral is refused, plain withdraw works.
    const pending = await submitForCandidate(a, await cand(a, orgA.id), j1);
    const tryRelease = await a.client.rpc("withdraw_referral", { p_referral: pending.referral_id!, p_reason: "x", p_expected_version: await version(pending.referral_id!), p_release: true, p_acting_org: orgA.id });
    expect(tryRelease.error?.message).toMatch(/release_not_allowed/);
    expect((await a.client.from("referrals").select("status").eq("id", pending.referral_id!).single()).data!.status).toBe("awaiting_candidate");
    await a.client.rpc("withdraw_referral", { p_referral: pending.referral_id!, p_reason: "x", p_expected_version: await version(pending.referral_id!), p_acting_org: orgA.id });
    expect((await a.client.rpc("release_referral", { p_referral: pending.referral_id!, p_acting_org: orgA.id })).error?.message).toMatch(/release_not_allowed/);

    // Declined: releasable since N3 (BR-34, supersedes PD-021), but never once a hire is recorded on it.
    const d = await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Guard ${uniq()}`));
    await b.client.rpc("review_referral", { p_referral: d.referral_id!, p_to: "declined", p_reason_code: "skills", p_note: "", p_expected_version: await version(d.referral_id!), p_acting_org: orgB.id });
    const hired = await b.client.rpc("report_hire", { p_referral: d.referral_id!, p_start_date: new Date().toISOString().slice(0, 10), p_expected_version: await version(d.referral_id!) } as never);
    expect(hired.error).toBeNull(); // flag off, never accepted → recorded without a split
    sql(`set session_replication_role = replica; update public.referrals set status = 'declined' where id = '${d.referral_id}'`);
    expect((await a.client.rpc("release_referral", { p_referral: d.referral_id!, p_acting_org: orgA.id })).error?.message).toMatch(/release_not_allowed/);

    // Outside the ownership window.
    const o = await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Guard ${uniq()}`));
    await a.client.rpc("withdraw_referral", { p_referral: o.referral_id!, p_reason: "x", p_expected_version: await version(o.referral_id!), p_acting_org: orgA.id });
    await admin().from("referrals").update({ ownership_protected_until: new Date(Date.now() - 1000).toISOString() }).eq("id", o.referral_id!);
    expect((await a.client.rpc("release_referral", { p_referral: o.referral_id!, p_acting_org: orgA.id })).error?.message).toMatch(/release_not_allowed/);
  });

  it("withdraw without release keeps first position (AC-21)", async () => {
    const shared = email("keep");
    const j1 = await bJob(`Keep ${uniq()}`);
    const first = await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1);
    await a.client.rpc("withdraw_referral", { p_referral: first.referral_id!, p_reason: "x", p_expected_version: await version(first.referral_id!), p_acting_org: orgA.id });
    expect((await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1)).outcome).toBe("stopped");
  });
});

// ---------------------------------------------------------------------------------------------
describe("decline reasons (BR-11)", () => {
  it("no longer accepts duplicate or prior_presentation as a manual decline (AC-24)", async () => {
    const r = await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Decl ${uniq()}`));
    for (const code of ["duplicate", "prior_presentation"]) {
      const { error } = await b.client.rpc("review_referral", { p_referral: r.referral_id!, p_to: "declined", p_reason_code: code, p_note: "", p_expected_version: await version(r.referral_id!), p_acting_org: orgB.id });
      expect(error?.message, code).toMatch(/reason_required/);
      const bulk = await b.client.rpc("decline_referrals", { p_ids: [r.referral_id!], p_reason_code: code });
      expect(bulk.error?.message, code).toMatch(/reason_required/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("prior-presentation claims with file evidence (BR-12 to BR-16, BR-18, EC-4, EC-8)", () => {
  let shared: string, job: string, ref: string, file: { id: string; bytes: Uint8Array; path: string }, dispute: string;

  beforeAll(async () => {
    shared = email("claim");
    job = await bJob(`Claim ${uniq()}`);
    ref = (await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), job)).referral_id!;
  });

  it("only the hiring side may upload; files are scanned and hashed by the worker (AC-30, AC-38, scenario 37)", async () => {
    const forged = await a.client.storage.from("claim-evidence").upload(`${orgA.id}/${ref}/${randomUUID()}.pdf`, pdf(), { contentType: "application/pdf" });
    expect(forged.error).not.toBeNull();
    expect((await c.client.rpc("list_claim_evidence_files", { p_referral: ref, p_acting_org: orgC.id })).error?.message).toMatch(/not_found/);
    expect((await a.client.rpc("list_claim_evidence_files", { p_referral: ref, p_acting_org: orgA.id })).error?.message).toMatch(/not_found/);

    file = await evidence(ref);
    const pendingClaim = await b.client.rpc("file_prior_presentation_claim", {
      p_referral: ref, p_expected_version: await version(ref), p_evidence_kind: "file", p_file_ids: [file.id], p_evidence_referral: null as never,
      p_prior_process_date: "2026-06-01", p_attested: true, p_note: "", p_acting_org: orgB.id,
    });
    expect(pendingClaim.error?.message).toMatch(/claim_files_not_ready/);

    await drainQueue();
    const { data: files } = await b.client.rpc("list_claim_evidence_files", { p_referral: ref, p_acting_org: orgB.id });
    const f = (files as { id: string; scan_status: string; sha256: string }[]).find((x) => x.id === file.id)!;
    expect(f.scan_status).toBe("clean");
    expect(f.sha256).toBe(createHash("sha256").update(file.bytes).digest("hex"));
    // SHA-256 is frozen once set.
    expect(() => sql(`update app.referral_claim_files set sha256 = repeat('0', 64) where id = '${file.id}'`)).toThrow();
  });

  it("enforces the prior-process date, attestation and evidence rules (AC-29)", async () => {
    const delivered = await deliveredDate(ref);
    const base = { p_referral: ref, p_evidence_kind: "file", p_file_ids: [file.id], p_evidence_referral: null as never, p_note: "", p_acting_org: orgB.id };
    const tooLate = await b.client.rpc("file_prior_presentation_claim", { ...base, p_expected_version: await version(ref), p_prior_process_date: delivered, p_attested: true });
    expect(tooLate.error?.message).toMatch(/claim_date_invalid/);
    const old = sql(`select ('${delivered}'::date - interval '6 months' - interval '1 day')::date`)[0];
    const tooEarly = await b.client.rpc("file_prior_presentation_claim", { ...base, p_expected_version: await version(ref), p_prior_process_date: old, p_attested: true });
    expect(tooEarly.error?.message).toMatch(/claim_date_invalid/);
    const unattested = await b.client.rpc("file_prior_presentation_claim", { ...base, p_expected_version: await version(ref), p_prior_process_date: "2026-10-01", p_attested: false });
    expect(unattested.error?.message).toMatch(/claim_attestation_required/);
    const sourceSide = await a.client.rpc("file_prior_presentation_claim", { ...base, p_acting_org: orgA.id, p_expected_version: await version(ref), p_prior_process_date: "2026-10-01", p_attested: true });
    expect(sourceSide.error?.message).toMatch(/not_found/);
  });

  it("files the claim: declined with prior_presentation, deadline frozen, source notified; still counts (AC-32)", async () => {
    // Revoking the sharing authorization doesn't block a claim (PD-027).
    const prior = sql(`select ((delivered_at at time zone 'America/Toronto')::date - 30) from public.referrals where id = '${ref}'`)[0];
    const { data, error } = await b.client.rpc("file_prior_presentation_claim", {
      p_referral: ref, p_expected_version: await version(ref), p_evidence_kind: "file", p_file_ids: [file.id], p_evidence_referral: null as never,
      p_prior_process_date: prior, p_attested: true, p_note: "In our ATS since September.", p_acting_org: orgB.id,
    });
    expect(error).toBeNull();
    const expected = sql(`select app.add_business_days(filed_at, 10) = contest_deadline_at from app.referral_claims where referral_id = '${ref}'`);
    expect(expected).toEqual(["t"]);
    expect((data as { contest_deadline_at: string }).contest_deadline_at).toBeTruthy();
    const { data: row } = await a.client.from("referrals").select("status, decline_reason").eq("id", ref).single();
    expect(row).toMatchObject({ status: "declined", decline_reason: "prior_presentation" });
    expect((await a.client.from("notifications").select("kind").eq("kind", "claim.filed")).data!.length).toBeGreaterThan(0);
    expect((await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), job)).outcome).toBe("stopped");

    const again = await b.client.rpc("file_prior_presentation_claim", {
      p_referral: ref, p_expected_version: await version(ref), p_evidence_kind: "file", p_file_ids: [file.id], p_evidence_referral: null as never,
      p_prior_process_date: prior, p_attested: true, p_note: "", p_acting_org: orgB.id,
    });
    expect(again.error?.message).toMatch(/claim_already_filed/);
  });

  it("the sourcing side sees metadata and hashes only, never the file (AC-37, AC-38, scenario 18)", async () => {
    const source = await presentation(a, ref, orgA.id);
    const files = source.claim!.files as Record<string, unknown>[];
    expect(Object.keys(files[0]).sort()).toEqual(["n", "sha256", "uploaded_at"]);
    expect(files[0].sha256).toBe(createHash("sha256").update(file.bytes).digest("hex"));
    expect(JSON.stringify(source)).not.toMatch(/ats-export|application\/pdf|evidence_referral_id/);
    expect(source.claim!.can_contest).toBe(true);
    expect((await a.client.rpc("authorize_claim_evidence", { p_file: file.id, p_acting_org: orgA.id })).error?.message).toMatch(/not_found/);
    expect((await a.client.rpc("authorize_claim_evidence", { p_file: file.id })).error?.message).toMatch(/not_found/);
    const signed = await b.client.rpc("authorize_claim_evidence", { p_file: file.id, p_acting_org: orgB.id });
    expect(signed.data).toBe(file.path);
    // Admin download needs a dispute (PD-024).
    expect((await platform.client.rpc("authorize_claim_evidence", { p_file: file.id })).error?.message).toMatch(/not_found/);
  });

  it("contest opens a referral dispute visible to admins and the contesting org only (AC-40, PD-027)", async () => {
    expect((await a.client.rpc("contest_prior_presentation_claim", { p_referral: ref, p_reason: "no", p_acting_org: orgA.id })).error?.message).toMatch(/reason_required/);
    expect((await b.client.rpc("contest_prior_presentation_claim", { p_referral: ref, p_reason: "Not true at all", p_acting_org: orgB.id })).error?.message).toMatch(/not_found/);
    const { data, error } = await a.client.rpc("contest_prior_presentation_claim", { p_referral: ref, p_reason: "We introduced them first.", p_acting_org: orgA.id });
    expect(error).toBeNull();
    dispute = data as string;
    expect((await a.client.rpc("contest_prior_presentation_claim", { p_referral: ref, p_reason: "Again please", p_acting_org: orgA.id })).error?.message).toMatch(/dispute_already_open/);
    expect((await b.client.from("disputes").select("reason").eq("id", dispute)).data).toHaveLength(0);
    expect((await a.client.from("disputes").select("reason").eq("id", dispute)).data).toHaveLength(1);
    expect((await b.client.from("notifications").select("kind").eq("kind", "dispute.opened")).data!.length).toBeGreaterThan(0);
    expect((await presentation(b, ref, orgB.id)).claim!.status).toBe("contested");
  });

  it("admin read model has no candidate label; evidence download is audited; contact compare is referral-evidence only (PD-024)", async () => {
    expect((await b.client.rpc("get_referral_dispute", { p_dispute: dispute })).error?.message).toMatch(/forbidden/);
    const { data } = await platform.client.rpc("get_referral_dispute", { p_dispute: dispute });
    const label = (await a.client.from("referrals").select("candidate_label").eq("id", ref).single()).data!.candidate_label;
    expect(JSON.stringify(data)).not.toContain(label);
    expect((data as { claim: { files: unknown[] } }).claim.files).toHaveLength(1);
    expect((await platform.client.rpc("authorize_claim_evidence", { p_file: file.id })).data).toBe(file.path);
    const { data: audit } = await platform.client.from("audit_events").select("metadata").eq("action", "claim_evidence.accessed").eq("entity_id", dispute);
    expect(audit).toHaveLength(1);
    expect((await platform.client.rpc("compare_dispute_contacts", { p_dispute: dispute })).error?.message).toMatch(/invalid_dispute_kind/);
    expect((await platform.client.rpc("resolve_dispute", { p_dispute: dispute, p_resolution: "Nope nope", p_upheld: true })).error?.message).toMatch(/invalid_dispute_kind/);
  });

  it("rejecting the claim returns the referral to review with a fresh clock and no second claim (AC-46, EC-8)", async () => {
    const before = await version(ref);
    expect((await b.client.rpc("resolve_prior_presentation_dispute", { p_dispute: dispute, p_claim_upheld: false, p_resolution: "Evidence predates nothing." })).error?.message).toMatch(/forbidden/);
    const { error } = await platform.client.rpc("resolve_prior_presentation_dispute", { p_dispute: dispute, p_claim_upheld: false, p_resolution: "The ATS export is dated after delivery." });
    expect(error).toBeNull();
    const { data: row } = await b.client.from("referrals").select("status, decline_reason, decided_at, version, claim_rejected_at, review_clock_started_at").eq("id", ref).single();
    expect(row).toMatchObject({ status: "submitted", decline_reason: null, decided_at: null, version: before + 1 });
    expect(row!.claim_rejected_at).not.toBeNull();
    expect(row!.review_clock_started_at).not.toBeNull();
    const target = await presentation(b, ref, orgB.id);
    expect(target.can_claim).toBe(false);
    expect(target.claim!.status).toBe("rejected");
    expect((await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), job)).outcome).toBe("stopped");
    expect((await a.client.from("notifications").select("kind").eq("title", "Objection rejected")).data!.length).toBeGreaterThan(0);
    const { data: ev } = await a.client.from("referral_status_events").select("actor_kind").eq("referral_id", ref).eq("to_status", "submitted").eq("actor_kind", "admin");
    expect(ev).toHaveLength(1);
  });

  it("refuses claims after accept and after the deadline (AC-33)", async () => {
    const r1 = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Late ${uniq()}`))).referral_id!;
    await admin().from("referrals").update({ claim_deadline_at: new Date(Date.now() - 1000).toISOString() }).eq("id", r1);
    expect((await presentation(b, r1, orgB.id)).can_claim).toBe(false);
    const late = await b.client.rpc("file_prior_presentation_claim", {
      p_referral: r1, p_expected_version: await version(r1), p_evidence_kind: "file", p_file_ids: [randomUUID()], p_evidence_referral: null as never,
      p_prior_process_date: "2026-10-01", p_attested: true, p_note: "", p_acting_org: orgB.id,
    });
    expect(late.error?.message).toMatch(/claim_window_closed/);

    const r2 = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Acc ${uniq()}`))).referral_id!;
    await b.client.rpc("review_referral", { p_referral: r2, p_to: "accepted", p_reason_code: "", p_note: "", p_expected_version: await version(r2), p_acting_org: orgB.id });
    const accepted = await b.client.rpc("file_prior_presentation_claim", {
      p_referral: r2, p_expected_version: await version(r2), p_evidence_kind: "file", p_file_ids: [randomUUID()], p_evidence_referral: null as never,
      p_prior_process_date: "2026-10-01", p_attested: true, p_note: "", p_acting_org: orgB.id,
    });
    expect(accepted.error?.message).toMatch(/claim_not_allowed/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("referral evidence, upheld and final claims (BR-16, BR-18, BR-26, EC-7)", () => {
  async function pair(tag: string) {
    const client = `${tag} ${uniq()}`;
    const early = await bJob(`${client} Corp`);
    const late = await bJob(client.toLowerCase());
    const earlyRef = (await submit(a, orgA.id, await cand(a, orgA.id, { email: email("early"), linkedin_url: null }), early)).referral_id!;
    const lateEmail = email("late");
    const lateRef = (await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: lateEmail, linkedin_url: null }), late)).referral_id!;
    return { early, late, earlyRef, lateRef, lateEmail };
  }
  const claimWithReferral = async (claimed: string, cited: string) =>
    b.client.rpc("file_prior_presentation_claim", {
      p_referral: claimed, p_expected_version: await version(claimed), p_evidence_kind: "referral", p_file_ids: [], p_evidence_referral: cited,
      p_prior_process_date: null as never, p_attested: true, p_note: "", p_acting_org: orgB.id,
    });

  it("picker lists only earlier, counting referrals of the same job or client; forged citations are refused (AC-31)", async () => {
    const p = await pair("Delta");
    const { data: options } = await b.client.rpc("list_claim_evidence_referrals", { p_referral: p.lateRef, p_acting_org: orgB.id });
    expect((options as { referral_id: string }[]).map((o) => o.referral_id)).toEqual([p.earlyRef]);
    const { data: none } = await b.client.rpc("list_claim_evidence_referrals", { p_referral: p.earlyRef, p_acting_org: orgB.id });
    expect(none).toEqual([]);
    expect((await claimWithReferral(p.earlyRef, p.lateRef)).error?.message).toMatch(/claim_referral_invalid/);
    const otherOrg = (await submit(a, orgA.id, await cand(a, orgA.id), await createJob(c, orgC.id))).referral_id!;
    expect((await claimWithReferral(p.lateRef, otherOrg)).error?.message).toMatch(/claim_referral_invalid/);
    expect((await a.client.rpc("list_claim_evidence_referrals", { p_referral: p.lateRef, p_acting_org: orgA.id })).error?.message).toMatch(/not_found/);
  });

  it("referral evidence uses the cited delivery date; the source sees no referral id; upheld stops counting (AC-39, AC-45)", async () => {
    const p = await pair("Epsilon");
    expect((await claimWithReferral(p.lateRef, p.earlyRef)).error).toBeNull();
    const claim = sql(`select prior_process_date = (select (delivered_at at time zone 'America/Toronto')::date from public.referrals where id = '${p.earlyRef}') from app.referral_claims where referral_id = '${p.lateRef}'`);
    expect(claim).toEqual(["t"]);
    const source = await presentation(a1, p.lateRef, orgA1.id);
    expect(JSON.stringify(source)).not.toContain(p.earlyRef);
    expect((await presentation(b, p.lateRef, orgB.id)).claim!.evidence_referral_id).toBe(p.earlyRef);

    const dispute = (await a1.client.rpc("contest_prior_presentation_claim", { p_referral: p.lateRef, p_reason: "Different person entirely.", p_acting_org: orgA1.id })).data as string;
    expect((await a1.client.rpc("compare_dispute_contacts", { p_dispute: dispute })).error?.message).toMatch(/forbidden/);
    const { data: signal } = await platform.client.rpc("compare_dispute_contacts", { p_dispute: dispute });
    expect(signal).toEqual({ email: "no_match", phone: "not_available", linkedin: "not_available" });
    expect((await platform.client.from("audit_events").select("id").eq("action", "dispute.contacts_compared").eq("entity_id", dispute)).data).toHaveLength(1);

    expect((await platform.client.rpc("resolve_prior_presentation_dispute", { p_dispute: dispute, p_claim_upheld: true, p_resolution: "Same candidate, earlier referral." })).error).toBeNull();
    expect(await presentation(a1, p.lateRef, orgA1.id)).toMatchObject({ ownership_state: "ended", counts: false });
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: p.lateEmail }), p.late)).outcome).toBe("created");
  });

  it("an uncontested claim is final as soon as the contest deadline passes, before any sweep (AC-41, EC-7, scenario 21)", async () => {
    const p = await pair("Zeta");
    expect((await claimWithReferral(p.lateRef, p.earlyRef)).error).toBeNull();
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: p.lateEmail }), p.late)).outcome).toBe("stopped");
    sql(`update app.referral_claims set contest_deadline_at = now() - interval '1 second' where referral_id = '${p.lateRef}'`);
    expect((await presentation(a1, p.lateRef, orgA1.id)).claim).toMatchObject({ status: "final", can_contest: false });
    expect((await a1.client.rpc("contest_prior_presentation_claim", { p_referral: p.lateRef, p_reason: "Too late now", p_acting_org: orgA1.id })).error?.message).toMatch(/contest_window_closed/);
    // A new record (the earlier one is sticky-stopped for 30 days, BR-24).
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: p.lateEmail }), await bJob(`Fresh ${uniq()}`))).outcome).toBe("created");
    const finalized = await admin().rpc("finalize_due_claims");
    expect(finalized.error).toBeNull();
    expect(sql(`select status from app.referral_claims where referral_id = '${p.lateRef}'`)).toEqual(["final"]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("business days (BR-17, BR-28, PD-019)", () => {
  it("computes the AC-52 deadlines at 23:59:59 America/Toronto", () => {
    const cases: [string, string][] = [
      ["2026-11-13 18:00", "2026-11-20"], ["2026-11-14 10:00", "2026-11-20"], ["2026-06-24 09:00", "2026-07-02"],
      ["2026-12-24 12:00", "2027-01-05"], ["2027-12-24 12:00", "2028-01-05"], ["2028-06-23 12:00", "2028-06-30"],
      ["2028-06-29 12:00", "2028-07-06"], ["2027-03-25 12:00", "2027-04-05"], ["2027-02-12 12:00", "2027-02-22"],
      ["2026-11-10 12:00", "2026-11-17"], ["2026-09-29 12:00", "2026-10-06"], ["2026-07-31 12:00", "2026-08-07"],
      ["2027-03-12 12:00", "2027-03-19"], ["2026-10-30 12:00", "2026-11-06"],
    ];
    for (const [event, day] of cases) {
      const [got] = sql(`select to_char(app.add_business_days(timestamp '${event}' at time zone 'America/Toronto', 5) at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI:SS')`);
      expect(got, event).toBe(`${day} 23:59:59`);
    }
    expect(sql(`select app.add_business_days(timestamp '2027-03-12 12:00' at time zone 'America/Toronto', 5) = '2027-03-20T03:59:59Z'::timestamptz`)).toEqual(["t"]);
    expect(sql(`select app.add_business_days(timestamp '2026-10-30 12:00' at time zone 'America/Toronto', 5) = '2026-11-07T04:59:59Z'::timestamptz`)).toEqual(["t"]);
    const [contest] = sql(`select to_char(app.add_business_days(timestamp '2026-11-18 10:00' at time zone 'America/Toronto', 10) at time zone 'America/Toronto', 'YYYY-MM-DD')`);
    expect(contest).toBe("2026-12-02");
  });

  it("2029 is seeded; past the seeded years it fails loudly (QA m-4, r2-m4)", () => {
    const day = (event: string) => sql(`select (app.add_business_days(timestamp '${event}' at time zone 'America/Toronto', 5) at time zone 'America/Toronto')::date`)[0];
    expect(day("2028-12-20 12:00")).toBe("2028-12-29");
    expect(day("2028-12-27 12:00")).toBe("2029-01-04"); // 28, 29, (1 Jan skipped), 2, 3, 4
    expect(day("2029-06-22 12:00")).toBe("2029-07-03"); // skips Mon 25 Jun and Mon 2 Jul (Sunday holidays moved)
    expect(day("2029-03-29 12:00")).toBe("2029-04-09"); // skips Good Friday 30 Mar and Easter Monday 2 Apr
    expect(() => sql(`select app.add_business_days(timestamp '2029-12-27 12:00' at time zone 'America/Toronto', 5)`)).toThrow(/holiday_calendar_exhausted/);
  });

  it("counts business days left, not counting today (AC-28)", () => {
    const left = (now: string) => sql(`select coalesce(app.business_days_left(timestamp '2026-11-20 23:59:59' at time zone 'America/Toronto', timestamp '${now}' at time zone 'America/Toronto')::text, 'null')`)[0];
    expect(left("2026-11-18 08:00")).toBe("2");
    expect(left("2026-11-20 23:00")).toBe("0");
    expect(left("2026-11-21 00:00")).toBe("null");
  });

  it("holiday edits apply to new deadlines only (AC-53, scenario 29)", async () => {
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Hol ${uniq()}`))).referral_id!;
    const [stored] = sql(`select claim_deadline_at from public.referrals where id = '${r}'`);
    const [next] = sql(`select (app.add_business_days(now(), 1) at time zone 'America/Toronto')::date`);
    sql(`insert into app.network_holidays (day, name, jurisdictions) values ('${next}', 'Test holiday', '{ON}')`);
    try {
      expect(sql(`select claim_deadline_at from public.referrals where id = '${r}'`)).toEqual([stored]);
      expect(sql(`select app.add_business_days(now(), 5) > '${stored}'::timestamptz`)).toEqual(["t"]);
    } finally {
      sql(`delete from app.network_holidays where day = '${next}' and name = 'Test holiday'`);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("privacy, tenancy and forged calls (BR-1, BR-2, BR-22, BR-23, BR-33)", () => {
  it("closed data isn't reachable through PostgREST by anyone (AC-55, scenario 35, 40)", async () => {
    for (const t of ["referral_fingerprints", "sticky_stops", "job_client_keys", "referral_presentations", "presentation_hits", "referral_claims", "referral_claim_files", "network_holidays"]) {
      const { error } = await a.client.from(t as never).select("*").limit(1);
      expect(error, t).not.toBeNull();
    }
    for (const fn of ["presentation_check", "candidate_fingerprints", "fingerprint_key", "client_key"]) {
      const { error } = await a.client.schema("app" as never).rpc(fn as never, {} as never);
      expect(error, fn).not.toBeNull();
    }
    const vault = await a.client.schema("vault" as never).from("decrypted_secrets" as never).select("*");
    expect(vault.error).not.toBeNull();
    const { data: jobRow } = await b.client.from("jobs").select("*").limit(1).single();
    expect(Object.keys(jobRow!)).not.toContain("client_key");
  });

  it("a connector/API job write gets a client key, whatever client_confidential says (BR-23, scenario 40)", async () => {
    const client = `Kappa ${uniq()}`;
    const { data, error } = await admin().from("jobs").insert({
      organization_id: orgB.id, owner_id: b.id, created_by: b.id, title: "Imported", client_name: `${client} Inc.`, client_confidential: true,
      description: "From a connector", status: "active", source: "api",
    }).select("id").single();
    expect(error).toBeNull();
    expect(sql(`select client_key from app.job_client_keys where job_id = '${data!.id}'`)).toEqual([client.toLowerCase()]);
  });

  it("no RPC accepts caller-supplied hashes or identifiers (scenario 35)", async () => {
    const r = await a.client.rpc("submit_referral", {
      p_candidate: randomUUID(), p_job: randomUUID(), p_fields: ["skills"], p_document_ids: [], p_consent: randomUUID(),
      p_idempotency_key: randomUUID(), p_fingerprints: ["deadbeef"],
    } as never);
    expect(r.error?.code).toBe("PGRST202");
  });

  it("other orgs get not_found on every side-specific RPC (IDOR)", async () => {
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Idor ${uniq()}`))).referral_id!;
    const calls = [
      c.client.rpc("get_referral_presentation", { p_referral: r, p_acting_org: orgC.id }),
      c.client.rpc("get_referral_presentation", { p_referral: r, p_acting_org: orgB.id }),
      c.client.rpc("list_claim_evidence_referrals", { p_referral: r, p_acting_org: orgB.id }),
      c.client.rpc("contest_prior_presentation_claim", { p_referral: r, p_reason: "pretend I am A", p_acting_org: orgA.id }),
      c.client.rpc("withdraw_referral", { p_referral: r, p_reason: "x", p_expected_version: 1, p_acting_org: orgA.id }),
      c.client.rpc("register_claim_evidence", { p_referral: r, p_storage_path: `${orgB.id}/${r}/${randomUUID()}.pdf`, p_file_name: "x.pdf", p_acting_org: orgB.id }),
      b.client.rpc("withdraw_referral", { p_referral: r, p_reason: "x", p_expected_version: 1, p_acting_org: orgB.id }),
      a.client.rpc("get_referral_presentation", { p_referral: r, p_acting_org: orgB.id }),
    ];
    for (const res of await Promise.all(calls)) expect(res.error?.message).toMatch(/not_found/);
  });

  it("admin metrics and abuse flags are platform-admin only (BR-29)", async () => {
    expect((await a.client.rpc("presentation_admin_metrics", { p_days: 30 })).error?.message).toMatch(/forbidden/);
    expect((await a.client.rpc("presentation_abuse_flags")).error?.message).toMatch(/forbidden/);
    const { data: metrics } = await platform.client.rpc("presentation_admin_metrics", { p_days: 30 });
    expect((metrics as { stops: number }).stops).toBeGreaterThan(0);
    const { data: flags } = await platform.client.rpc("presentation_abuse_flags");
    expect((flags ?? []).some((f) => f.organization_id === orgA.id)).toBe(true); // A was stopped > 5 times in this file
  });

  it("purge drops fingerprints outside the window; anonymisation drops a candidate's fingerprints (AC-58, BR-21)", async () => {
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Purge ${uniq()}`))).referral_id!;
    expect(Number(sql(`select count(*) from app.referral_fingerprints where referral_id = '${r}'`)[0])).toBeGreaterThan(0);
    await admin().from("referrals").update({ ownership_protected_until: new Date(Date.now() - 1000).toISOString() }).eq("id", r);
    expect((await admin().rpc("purge_presentation_data")).error).toBeNull();
    expect(sql(`select count(*) from app.referral_fingerprints where referral_id = '${r}'`)).toEqual(["0"]);
    expect((await a.client.rpc("purge_presentation_data")).error?.message).toMatch(/permission denied/);

    const y = await cand(a, orgA.id);
    const r2 = (await submit(a, orgA.id, y, await bJob(`Anon ${uniq()}`))).referral_id!;
    expect((await a.client.rpc("anonymize_candidate", { p_candidate: y, p_reason: "Candidate request" })).error).toBeNull();
    expect(sql(`select count(*) from app.referral_fingerprints where referral_id = '${r2}'`)).toEqual(["0"]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("contract fixes after the frontend build (20261113000800)", () => {
  /** Exactly what the fileClaim action sends: parsed input -> fileClaimRpcArgs -> JSON. */
  const viaAction = async (input: Record<string, unknown>) => {
    const args = JSON.parse(JSON.stringify(fileClaimRpcArgs(fileClaimSchema.parse(input), orgB.id)));
    return b.client.rpc("file_prior_presentation_claim", args);
  };

  it("files a file-evidence objection through the action's arguments", async () => {
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`ActFile ${uniq()}`))).referral_id!;
    const f = await evidence(r);
    await drainQueue();
    const prior = sql(`select ((delivered_at at time zone 'America/Toronto')::date - 10) from public.referrals where id = '${r}'`)[0];
    const res = await viaAction({ referralId: r, version: await version(r), evidenceKind: "file", fileIds: [f.id], priorProcessDate: prior, attested: true });
    expect(res.error).toBeNull();
  });

  it("files a referral-evidence objection through the action's arguments, and keys may be omitted", async () => {
    const client = `ActRef ${uniq()}`;
    const early = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(client))).referral_id!;
    const late = (await submit(a1, orgA1.id, await cand(a1, orgA1.id), await bJob(client))).referral_id!;
    const late2 = (await submit(a1, orgA1.id, await cand(a1, orgA1.id), await bJob(client))).referral_id!;
    const res = await viaAction({ referralId: late, version: await version(late), evidenceKind: "referral", evidenceReferralId: early, attested: true });
    expect(res.error).toBeNull();
    // Defaults: a caller that drops the unused keys still reaches the function.
    const omitted = await b.client.rpc("file_prior_presentation_claim", {
      p_referral: late2, p_expected_version: await version(late2), p_evidence_kind: "referral", p_file_ids: [],
      p_evidence_referral: early, p_attested: true, p_acting_org: orgB.id,
    } as never);
    expect(omitted.error).toBeNull();
  });

  it("picker options carry the revoked flag; revoked referrals still qualify (AC-31, PD-027)", async () => {
    const client = `Revoked ${uniq()}`;
    const earlyCand = await cand(a, orgA.id);
    const earlyJob = await bJob(client);
    const consent = await sharingConsent(a, orgA.id, earlyCand, earlyJob);
    const early = (await a.client.rpc("submit_referral", {
      p_candidate: earlyCand, p_job: earlyJob, p_terms_version: await termsOf(earlyJob), p_fields: ["skills"], p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID(),
    }).single()).data!.referral_id;
    await a.client.from("candidate_consents").update({ revoked_at: new Date().toISOString(), revoked_reason: "Candidate request" }).eq("id", consent);
    const late = (await submit(a1, orgA1.id, await cand(a1, orgA1.id), await bJob(client))).referral_id!;
    const { data } = await b.client.rpc("list_claim_evidence_referrals", { p_referral: late, p_acting_org: orgB.id });
    expect(data).toEqual([expect.objectContaining({ referral_id: early, revoked: true })]);
  });

  it("admin dispute view returns business days left before resolve_by (AC-43)", async () => {
    const client = `ResolveBy ${uniq()}`;
    const early = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(client))).referral_id!;
    const late = (await submit(a1, orgA1.id, await cand(a1, orgA1.id), await bJob(client))).referral_id!;
    expect((await viaAction({ referralId: late, version: await version(late), evidenceKind: "referral", evidenceReferralId: early, attested: true })).error).toBeNull();
    const dispute = (await a1.client.rpc("contest_prior_presentation_claim", { p_referral: late, p_reason: "We were first here.", p_acting_org: orgA1.id })).data as string;
    const { data } = await platform.client.rpc("get_referral_dispute", { p_dispute: dispute });
    const d = (data as { dispute: { resolve_by: string; resolve_by_business_days_left: number } }).dispute;
    expect(d.resolve_by_business_days_left).toBe(Number(sql(`select app.business_days_left('${d.resolve_by}'::timestamptz)`)[0]));
    expect(d.resolve_by_business_days_left).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------------------------
describe("QA fixes (20261113000900)", () => {
  /** Fills a user's current window for a bucket, as if they had already used it up. */
  const exhaust = (userId: string, bucket: string, hits: number) =>
    sql(`insert into app.rate_limits (user_id, bucket, window_start, hits)
         values ('${userId}', '${bucket}', to_timestamp(floor(extract(epoch from now()) / 3600) * 3600), ${hits})
         on conflict (user_id, bucket, window_start) do update set hits = excluded.hits`);

  it("objections (10/h), contests (5/h) and evidence uploads (30/h) are limited in the database (B-1)", async () => {
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), await bJob(`Rl ${uniq()}`))).referral_id!;
    exhaust(b.id, "referral.claim", 10);
    const claim = await b.client.rpc("file_prior_presentation_claim", {
      p_referral: r, p_expected_version: await version(r), p_evidence_kind: "file", p_file_ids: [randomUUID()], p_attested: true, p_acting_org: orgB.id,
    } as never);
    expect(claim.error?.message).toMatch(/^rate_limited/);
    exhaust(a.id, "dispute.open", 5);
    expect((await a.client.rpc("contest_prior_presentation_claim", { p_referral: r, p_reason: "Over the limit", p_acting_org: orgA.id })).error?.message).toMatch(/^rate_limited/);
  });

  it("direct evidence uploads are counted where the write commits: 30 per hour, the 31st refused (R2-2)", async () => {
    const hb = await createUser("n1-uploader");
    const borg = await createOrg(hb, "N1 Upload Org");
    const job = await createJob(hb, borg.id, { title: `Up ${uniq()}`, client_name: `Client ${uniq()}` });  // N3 BR-1: a real name to open
    const r = (await submit(a, orgA.id, await cand(a, orgA.id), job)).referral_id!;
    const ok: boolean[] = [];
    for (let i = 0; i < 31; i++) {
      const up = await hb.client.storage.from("claim-evidence").upload(`${borg.id}/${r}/${randomUUID()}.pdf`, pdf(), { contentType: "application/pdf" });
      ok.push(!up.error);
    }
    expect(ok.slice(0, 30).every(Boolean)).toBe(true);
    expect(ok[30]).toBe(false);
    expect(sql(`select sum(hits) >= 30 from app.rate_limits where user_id = '${hb.id}' and bucket = 'storage.claim_evidence'`)).toEqual(["t"]);
  });

  // N9 (brief R-5): the R2-1 "reused token hash → invalid_token" test is retired with the p_token_hash
  // signatures. Replacement: a forged call with p_token_hash never reaches the database (PGRST202), so
  // it runs no check and consumes nothing, and the candidate path stores no hash a caller could reuse.
  it("N9: a p_token_hash call is refused before the database (no check, no hit); requests start with no hash (R2-1 retired, r2-m3)", async () => {
    const u = await createUser("n1-token");
    const org = await createOrg(u, "N1 Token Org");
    const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
    const forged = await u.client.rpc("submit_referral_for_candidate", {
      p_candidate: await cand(u, org.id), p_job: await bJob(`Tk ${uniq()}`), p_fields: ["skills"], p_document_ids: [], p_idempotency_key: randomUUID(), p_token_hash: hash,
    } as never);
    expect(forged.error?.code).toBe("PGRST202");
    expect(JSON.stringify(forged.error)).not.toMatch(/token_hash_key|duplicate key|constraint/);
    expect(sql(`select count(*) from app.presentation_hits where source_org_id = '${org.id}'`)).toEqual(["0"]);
    expect(sql(`select coalesce(sum(hits), 0) from app.rate_limits where user_id = '${u.id}' and bucket = 'referral.submit'`)).toEqual(["0"]);
    const rot = await u.client.rpc("rotate_candidate_request_token", { p_referral: randomUUID(), p_token_hash: hash, p_ttl_days: 14 } as never);
    expect(rot.error?.code).toBe("PGRST202");
    // Two real submissions: both created, both counted, neither stores a hash.
    for (let i = 0; i < 2; i++) {
      const tkJob = await bJob(`Tk ${uniq()}`);
      const { data } = await u.client.rpc("submit_referral_for_candidate", {
        p_candidate: await cand(u, org.id), p_job: tkJob, p_terms_version: await termsOf(tkJob), p_fields: ["skills"], p_document_ids: [], p_idempotency_key: randomUUID(),
      }).single();
      expect((data as Outcome).outcome).toBe("created");
    }
    expect(sql(`select coalesce(sum(hits), 0) from app.rate_limits where user_id = '${u.id}' and bucket = 'referral.submit'`)).toEqual(["2"]);
    expect(sql(`select count(*) from public.referral_candidate_requests where organization_id = '${org.id}' and token_hash is not null`)).toEqual(["0"]);
  });

  it("the support reference is 8 random digits, unique, and traceable by admins only (m-5)", async () => {
    const shared = email("ref");
    const j1 = await bJob(`Ref ${uniq()}`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    const r1 = await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1);
    const r2 = await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1);
    expect(r1.reference).toMatch(/^\d{8}$/);
    expect(r1.reference).not.toBe(r2.reference);
    expect(sql(`select count(*) from app.presentation_hits where reference = '${r1.reference}'`)).toEqual(["1"]);
    const { data: adminView } = await platform.client.from("audit_events").select("metadata").eq("action", "referral.fingerprint_hit").eq("entity_id", j1);
    expect(adminView!.map((x) => (x.metadata as { reference?: string }).reference)).toContain(r1.reference);
    const { data: memberView } = await a.client.from("audit_events").select("metadata").eq("entity_id", j1);
    expect(JSON.stringify(memberView)).not.toContain(r1.reference!);
  });
});

// ---------------------------------------------------------------------------------------------
describe("PM decisions (20261113001000, PD-029, PD-032, m-5)", () => {
  it("evidence is judged at the claimed referral's delivery: released before it → not eligible (PD-029)", async () => {
    const j1 = await bJob(`Pd29 ${uniq()}`);
    const early = (await submit(a, orgA.id, await cand(a, orgA.id), j1)).referral_id!;
    await a.client.rpc("withdraw_referral", { p_referral: early, p_reason: "Paused", p_expected_version: await version(early), p_release: true, p_acting_org: orgA.id });
    const late = (await submit(a1, orgA1.id, await cand(a1, orgA1.id), j1)).referral_id!;
    const { data } = await b.client.rpc("list_claim_evidence_referrals", { p_referral: late, p_acting_org: orgB.id });
    expect(data).toEqual([]);
    const forged = await b.client.rpc("file_prior_presentation_claim", {
      p_referral: late, p_expected_version: await version(late), p_evidence_kind: "referral", p_file_ids: [], p_evidence_referral: early, p_attested: true, p_acting_org: orgB.id,
    } as never);
    expect(forged.error?.message).toMatch(/claim_referral_invalid/);
  });

  it("evidence whose window ended after the claimed delivery stays eligible; upheld evidence doesn't (PD-029)", async () => {
    const j1 = await bJob(`Pd29b ${uniq()}`);
    const early = (await submit(a, orgA.id, await cand(a, orgA.id), j1)).referral_id!;
    const late = (await submit(a1, orgA1.id, await cand(a1, orgA1.id), j1)).referral_id!;
    const lateDelivered = (await admin().from("referrals").select("delivered_at").eq("id", late).single()).data!.delivered_at!;
    // Window ends after C's delivery but before now: judged at C's delivery, still eligible.
    await admin().from("referrals").update({ ownership_protected_until: new Date(new Date(lateDelivered).getTime() + 1).toISOString() }).eq("id", early);
    await new Promise((r) => setTimeout(r, 20));
    const pick = async () => ((await b.client.rpc("list_claim_evidence_referrals", { p_referral: late, p_acting_org: orgB.id })).data as { referral_id: string }[]).map((o) => o.referral_id);
    expect(await pick()).toEqual([early]);
    sql(`update app.referral_presentations set void_reason = 'prior_presentation_upheld' where referral_id = '${early}'`);
    expect(await pick()).toEqual([]);
  });

  it("an awaiting referral with an expired link isn't pending; the sweep drops its fingerprints; a resend recomputes them (PD-032, scenario 48, AC-76)", async () => {
    const shared = email("exp");
    const j1 = await bJob(`Exp ${uniq()}`);
    const y = await cand(a1, orgA1.id, { email: shared });
    const pending = await submitForCandidate(a1, y, j1);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1)).outcome).toBe("pending_warning");

    sql(`update public.referral_candidate_requests set expires_at = now() - interval '1 second' where referral_id = '${pending.referral_id}'`);
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: email("other") }), await bJob(`Fresh ${uniq()}`))).outcome).toBe("created");
    const z = await cand(a, orgA.id, { email: shared });
    const [beforeHash] = sql(`select encode(hash, 'hex') from app.referral_fingerprints where referral_id = '${pending.referral_id}' and kind = 'email'`);
    expect(beforeHash).toBeTruthy();

    expect((await admin().rpc("purge_presentation_data")).error).toBeNull();
    expect(sql(`select count(*) from app.referral_fingerprints where referral_id = '${pending.referral_id}'`)).toEqual(["0"]);

    // Resend: fingerprints recomputed from the current row (email changed meanwhile), no stop check.
    const changed = email("resent");
    await a1.client.from("candidates").update({ email: changed }).eq("id", y);
    const rot = await a1.client.rpc("rotate_candidate_request_token", { p_referral: pending.referral_id!, p_ttl_days: 14 });
    expect(rot.error).toBeNull();
    const [afterHash] = sql(`select encode(hash, 'hex') from app.referral_fingerprints where referral_id = '${pending.referral_id}' and kind = 'email'`);
    expect(afterHash).toBeTruthy();
    expect(afterHash).not.toBe(beforeHash);
    // Pending again, with the new identifiers: the old email no longer warns, the new one does.
    expect((await submit(a, orgA.id, z, j1)).outcome).toBe("created");
    expect((await submit(a, orgA.id, await cand(a, orgA.id, { email: changed }), j1)).outcome).toBe("pending_warning");
  });

  it("platform admins look a stop up by its reference; nobody else can (m-5)", async () => {
    const shared = email("look");
    const j1 = await bJob(`Look ${uniq()}`);
    await submit(a1, orgA1.id, await cand(a1, orgA1.id, { email: shared }), j1);
    const stop = await submit(a, orgA.id, await cand(a, orgA.id, { email: shared }), j1);
    const { data, error } = await platform.client.rpc("get_stop_by_reference", { p_reference: stop.reference! });
    expect(error).toBeNull();
    expect(data).toMatchObject({ reference: stop.reference, outcome: "stop", scope: "job", job_id: j1, source_org: { id: orgA.id }, target_org: { id: orgB.id } });
    expect((await a.client.rpc("get_stop_by_reference", { p_reference: stop.reference! })).error?.message).toMatch(/forbidden/);
    expect((await platform.client.rpc("get_stop_by_reference", { p_reference: "00000000" })).error?.message).toMatch(/not_found/);
  });
});
