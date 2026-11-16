import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { admin, anon, createCandidate, createJob, createOrg, createUser, issueCandidateToken, sql, termsOf, type TestUser } from "./helpers";

/**
 * N9 candidate-confirmation integrity (docs/specs/candidate-confirmation-integrity, brief §7
 * scenarios 1–4 and 9, plus the BR-6 / BR-10 / BR-12 server rules).
 * A = sourcing org (recruiter `a`, second member `a2`), B = hiring org, X = an unrelated org.
 */

let a: TestUser, a2: TestUser, b: TestUser, x: TestUser;
let orgA: { id: string }, orgB: { id: string };

const uniq = () => randomUUID().slice(0, 8);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

type Created = { outcome: string; referral_id: string | null; created: boolean; destination: string | null; reference: string | null };

const job = () => createJob(b, orgB.id, { title: `N9 Role ${uniq()}`, client_name: `N9 Client ${uniq()}` });
const cand = (over: Record<string, unknown> = {}) => createCandidate(a, orgA.id, { email: `n9-${uniq()}@example.com`, ...over });

async function submitForCandidate(u: TestUser = a, candidateId?: string, jobId?: string) {
  const theJob = jobId ?? (await job());
  const { data, error } = await u.client
    .rpc("submit_referral_for_candidate", {
      p_candidate: candidateId ?? (await cand()), p_job: theJob, p_terms_version: await termsOf(theJob), p_fields: ["headline", "skills"],
      p_document_ids: [], p_idempotency_key: randomUUID(),
    })
    .single();
  if (error) throw new Error(error.message);
  const out = data as Created;
  expect(out.outcome).toBe("created");
  return out;
}

const request = async (referralId: string) =>
  (await admin().from("referral_candidate_requests").select("*").eq("referral_id", referralId).single()).data!;

const respond = (token: string, accept = true) =>
  anon().rpc("respond_candidate_request", { p_token: token, p_accept: accept, p_profile: {} as never });

const view = async (token: string) => (await anon().rpc("get_candidate_request", { p_token: token })).data as { state: string } | null;

beforeAll(async () => {
  [a, a2, b, x] = await Promise.all([createUser("n9-a"), createUser("n9-a2"), createUser("n9-b"), createUser("n9-x")]);
  orgA = await createOrg(a, "N9 Agency A");
  orgB = await createOrg(b, "N9 Hiring B");
  await createOrg(x, "N9 Other X");
  // a2 joins A as a second, active member.
  // RD-036: a plain recruiter no longer sees a colleague's referrals, so the teammate who acts on
  // a's referrals here is a manager (plain-recruiter denial: recruiter-record-scope.test.ts).
  sql(`insert into public.organization_memberships (organization_id, user_id, role, status) values ('${orgA.id}', '${a2.id}', 'recruiter_manager', 'active')`);
});

beforeEach(() => {
  sql(`delete from app.rate_limits where user_id in ('${a.id}', '${a2.id}', '${b.id}', '${x.id}')`);
});

// ---------------------------------------------------------------------------------------------
describe("scenario 1: forgery refused on submit (BR-1, BR-3, BR-4)", () => {
  it("the old p_token_hash signature no longer exists", async () => {
    const { error } = await a.client.rpc("submit_referral_for_candidate", {
      p_candidate: await cand(), p_job: await job(), p_fields: ["skills"], p_document_ids: [], p_idempotency_key: randomUUID(),
      p_token_hash: sha(randomBytes(32).toString("base64url")),
    } as never);
    expect(error?.code).toBe("PGRST202");
    expect(sql(`select count(*) from pg_proc where proname in ('submit_referral_for_candidate', 'rotate_candidate_request_token')
                 and pg_get_function_identity_arguments(oid) like '%p_token_hash%'`)).toEqual(["0"]);
  });

  it("the new signature creates the request with no usable token and returns no token or hash", async () => {
    const out = await submitForCandidate();
    expect(Object.keys(out).sort()).toEqual(["created", "destination", "outcome", "reference", "referral_id"]);
    expect(JSON.stringify(out)).not.toMatch(/[0-9a-f]{64}|[A-Za-z0-9_-]{43}/);
    const q = await request(out.referral_id!);
    expect(q.token_hash).toBeNull();
    expect(q.token_issued_at).toBeNull();
    expect(q.token_issued_by).toBeNull();
    expect(q.sent_at).toBeNull();
    // Nothing can confirm it before issuance.
    const all = sql(`select count(*) from public.referral_candidate_requests where referral_id = '${out.referral_id}' and token_hash is not null`);
    expect(all).toEqual(["0"]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("scenario 2: forgery refused on resend (BR-4, BR-5, BR-10)", () => {
  it("the old rotate signature no longer exists", async () => {
    const out = await submitForCandidate();
    const { error } = await a.client.rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_token_hash: "a".repeat(64), p_ttl_days: 14 } as never);
    expect(error?.code).toBe("PGRST202");
  });

  it("rotate kills the old link at once, returns only the destination, and the next issuance works", async () => {
    const out = await submitForCandidate();
    const t1 = await issueCandidateToken(out.referral_id!, a.id);
    expect(await view(t1)).toMatchObject({ state: "pending" });

    const rot = await a.client.rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_ttl_days: 14 });
    expect(rot.error).toBeNull();
    expect(rot.data).toBe(out.destination);
    expect(await view(t1)).toBeNull();
    expect((await respond(t1)).error?.message).toBe("not_found");
    const q = await request(out.referral_id!);
    expect([q.token_hash, q.token_issued_at, q.token_issued_by]).toEqual([null, null, null]);

    const t2 = await issueCandidateToken(out.referral_id!, a.id);
    expect(t2).not.toBe(t1);
    expect(await view(t2)).toMatchObject({ state: "pending" });
    expect((await respond(t2)).data).toBe("confirmed");
  });

  it("another org cannot rotate (forbidden), and the 11th resend in an hour is refused, each counted once (BR-10)", async () => {
    const out = await submitForCandidate();
    expect((await x.client.rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_ttl_days: 14 })).error?.message).toBe("forbidden");
    expect((await b.client.rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_ttl_days: 14 })).error?.message).toBe("forbidden");
    const results: (string | null)[] = [];
    for (let i = 0; i < 11; i++) {
      results.push((await a.client.rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_ttl_days: 14 })).error?.message ?? null);
    }
    expect(results.slice(0, 10)).toEqual(Array(10).fill(null));
    expect(results[10]).toBe("rate_limited");
    expect(sql(`select sum(hits) from app.rate_limits where user_id = '${a.id}' and bucket = 'referral.candidate_resend'`)).toEqual(["10"]); // one hit per resend; the refused one rolls back its own hit
  });
});

// ---------------------------------------------------------------------------------------------
describe("scenario 3: issuance is not reachable from user roles (BR-2)", () => {
  it("anon and authenticated (own referral) are refused; the token is never returned to them", async () => {
    const out = await submitForCandidate();
    const anonCall = await anon().rpc("issue_candidate_request_token", { p_referral: out.referral_id!, p_actor: a.id });
    expect(anonCall.error?.message).toMatch(/permission denied for function/);
    expect(anonCall.data).toBeNull();
    const own = await a.client.rpc("issue_candidate_request_token", { p_referral: out.referral_id!, p_actor: a.id });
    expect(own.error?.message).toMatch(/permission denied for function/);
    expect(own.data).toBeNull();
    expect((await request(out.referral_id!)).token_hash).toBeNull();
    expect(sql(`select has_function_privilege('authenticated', 'public.issue_candidate_request_token(uuid, uuid)', 'execute'),
                       has_function_privilege('anon', 'public.issue_candidate_request_token(uuid, uuid)', 'execute'),
                       has_function_privilege('service_role', 'public.issue_candidate_request_token(uuid, uuid)', 'execute')`))
      .toEqual(["f|f|t"]);
  });

  it("service role issues a 256-bit base64url token whose SHA-256 is stored, with issuer and time", async () => {
    const out = await submitForCandidate();
    const token = await issueCandidateToken(out.referral_id!, a2.id);
    expect(token).toMatch(TOKEN);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    const q = await request(out.referral_id!);
    expect(q.token_hash).toBe(sha(token));
    expect(q.token_issued_by).toBe(a2.id);
    expect(q.token_issued_at).not.toBeNull();
    // The source org reads the issuance columns, not the hash.
    const mine = await a.client.from("referral_candidate_requests").select("token_issued_at, token_issued_by").eq("referral_id", out.referral_id!).single();
    expect(mine.data?.token_issued_by).toBe(a2.id);
  });
});

// ---------------------------------------------------------------------------------------------
describe("scenario 4: no token or hash leaks (BR-3, BR-8)", () => {
  it("a recruiter session can't read token_hash, and no audit, notification, event or response_meta holds the token or hash", async () => {
    const denied = await a.client.from("referral_candidate_requests").select("token_hash").limit(1);
    expect(denied.error?.code).toBe("42501");
    const star = await a.client.from("referral_candidate_requests").select("*").limit(1);
    expect(star.error?.code).toBe("42501");

    // Full flow: submit, issue, resend (rotate + issue), confirm; and a declined one.
    const out = await submitForCandidate();
    const t1 = await issueCandidateToken(out.referral_id!, a.id);
    expect((await a.client.rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_ttl_days: 14 })).error).toBeNull();
    const t2 = await issueCandidateToken(out.referral_id!, a.id);
    expect((await respond(t2)).data).toBe("confirmed");
    const dec = await submitForCandidate();
    const t3 = await issueCandidateToken(dec.referral_id!, a.id);
    expect((await respond(t3, false)).data).toBe("declined");

    const secrets = [t1, t2, t3, sha(t1), sha(t2), sha(t3)];
    const refs = `'${out.referral_id}', '${dec.referral_id}'`;
    const dumps = [
      sql(`select coalesce(string_agg(a::text, ' '), '') from public.audit_events a where entity_id in (${refs}) or organization_id in ('${orgA.id}', '${orgB.id}')`)[0] ?? "",
      sql(`select coalesce(string_agg(n::text, ' '), '') from public.notifications n where organization_id in ('${orgA.id}', '${orgB.id}')`)[0] ?? "",
      sql(`select coalesce(string_agg(e::text, ' '), '') from public.referral_status_events e where referral_id in (${refs})`)[0] ?? "",
      sql(`select coalesce(string_agg(response_meta::text || ' ' || coalesce(last_send_error, ''), ' '), '') from public.referral_candidate_requests where referral_id in (${refs})`)[0] ?? "",
      sql(`select coalesce(string_agg(k::text, ' '), '') from public.candidate_consents k where organization_id = '${orgA.id}'`)[0] ?? "",
      sql(`select coalesce(string_agg(r::text, ' '), '') from public.referrals r where id in (${refs})`)[0] ?? "",
    ].join("\n");
    for (const s of secrets) expect(dumps.includes(s)).toBe(false);

    // BR-8 audit trail: two issuances (send numbers 1 and 2), one resend, then the confirmation with token_issued_at.
    const { data: audit } = await admin().from("audit_events").select("action, actor_id, metadata").eq("entity_id", out.referral_id!).order("id");
    const issued = audit!.filter((e) => e.action === "referral.candidate_request_issued");
    expect(issued.map((e) => (e.metadata as { send_number: number }).send_number)).toEqual([1, 2]);
    expect(issued.every((e) => e.actor_id === a.id)).toBe(true);
    expect(audit!.filter((e) => e.action === "referral.candidate_request_resent")).toHaveLength(1);
    const confirmed = audit!.find((e) => e.action === "referral.candidate_confirmed")!;
    expect((confirmed.metadata as { token_issued_at: string }).token_issued_at).toBeTruthy();
    const ev = sql(`select k.evidence from public.candidate_consents k join public.referral_candidate_requests q on q.consent_id = k.id where q.referral_id = '${out.referral_id}'`)[0];
    expect(ev).toMatch(/\(issued \d{4}-\d{2}-\d{2} \d{2}:\d{2}, sent /);
  });
});

// ---------------------------------------------------------------------------------------------
describe("scenario 9: issuance re-checks (BR-5, R-4)", () => {
  const issue = (referralId: string, actor: string) => admin().rpc("issue_candidate_request_token", { p_referral: referralId, p_actor: actor });

  it("refuses a non-member actor (other org, hiring side, unknown user)", async () => {
    const out = await submitForCandidate();
    expect((await issue(out.referral_id!, x.id)).error?.message).toBe("forbidden");
    expect((await issue(out.referral_id!, b.id)).error?.message).toBe("forbidden");
    expect((await issue(out.referral_id!, randomUUID())).error?.message).toBe("forbidden");
    expect((await issue(randomUUID(), a.id)).error?.message).toBe("not_found");
    expect((await request(out.referral_id!)).token_hash).toBeNull();
  });

  it("refuses an inactive membership", async () => {
    const out = await submitForCandidate();
    sql(`update public.organization_memberships set status = 'suspended' where organization_id = '${orgA.id}' and user_id = '${a2.id}'`);
    try {
      expect((await issue(out.referral_id!, a2.id)).error?.message).toBe("forbidden");
    } finally {
      sql(`update public.organization_memberships set status = 'active' where organization_id = '${orgA.id}' and user_id = '${a2.id}'`);
    }
  });

  it("refuses a referral that is not awaiting the candidate (confirmed, declined, withdrawn)", async () => {
    const conf = await submitForCandidate();
    expect((await respond(await issueCandidateToken(conf.referral_id!, a.id))).data).toBe("confirmed");
    expect((await issue(conf.referral_id!, a.id)).error?.message).toBe("request_closed");

    const dec = await submitForCandidate();
    expect((await respond(await issueCandidateToken(dec.referral_id!, a.id), false)).data).toBe("declined");
    expect((await issue(dec.referral_id!, a.id)).error?.message).toBe("request_closed");

    const wd = await submitForCandidate();
    sql(`update public.referrals set status = 'withdrawn' where id = '${wd.referral_id}'`);
    expect((await issue(wd.referral_id!, a.id)).error?.message).toBe("request_closed");
  });

  it("refuses a request that already holds a live token until it is rotated", async () => {
    const out = await submitForCandidate();
    const t1 = await issueCandidateToken(out.referral_id!, a.id);
    const again = await issue(out.referral_id!, a.id);
    expect(again.error?.message).toBe("token_already_issued");
    expect(again.data).toBeNull();
    expect((await request(out.referral_id!)).token_hash).toBe(sha(t1)); // unchanged, old link still works
    expect(await view(t1)).toMatchObject({ state: "pending" });
  });

  it("refuses an expired, never-issued request (resend re-arms it)", async () => {
    const out = await submitForCandidate();
    sql(`update public.referral_candidate_requests set expires_at = now() - interval '1 second' where referral_id = '${out.referral_id}'`);
    expect((await issue(out.referral_id!, a.id)).error?.message).toBe("request_expired");
    expect((await a.client.rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_ttl_days: 14 })).error).toBeNull();
    expect(await issueCandidateToken(out.referral_id!, a.id)).toMatch(TOKEN);
  });
});

// ---------------------------------------------------------------------------------------------
describe("server-issued tokens only (BR-6, BR-7 state)", () => {
  it("a stored hash without token_issued_at (pre-N9 shape) is never pending and cannot answer", async () => {
    const out = await submitForCandidate();
    const legacy = randomBytes(32).toString("base64url");
    // Simulates a pre-N9 request: a caller-chosen hash, never issued by the server, still in date.
    sql(`update public.referral_candidate_requests set token_hash = '${sha(legacy)}', token_issued_at = null where referral_id = '${out.referral_id}'`);
    const page = await view(legacy);
    expect(page).toMatchObject({ state: "expired" });
    expect(page).not.toHaveProperty("candidate");
    expect((await respond(legacy)).error?.message).toBe("request_expired");
    expect((await respond(legacy, false)).error?.message).toBe("request_expired");
    expect((await admin().from("referrals").select("status").eq("id", out.referral_id!).single()).data!.status).toBe("awaiting_candidate");
    // The recruiter's Resend path recovers it: rotate drops the legacy hash, issuance gives a working link.
    expect((await a.client.rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_ttl_days: 14 })).error).toBeNull();
    expect(await view(legacy)).toBeNull();
    expect((await respond(await issueCandidateToken(out.referral_id!, a.id))).data).toBe("confirmed");
  });
});

// ---------------------------------------------------------------------------------------------
describe("BR-12: recent candidate email change in the consent evidence", () => {
  const evidence = (referralId: string) =>
    sql(`select k.evidence from public.candidate_consents k join public.referral_candidate_requests q on q.consent_id = k.id where q.referral_id = '${referralId}'`)[0];

  it("states the change date when the email changed in the 30 days before issuance", async () => {
    const id = await cand();
    expect((await a.client.from("candidates").update({ email: `n9-changed-${uniq()}@example.com` }).eq("id", id)).error).toBeNull();
    const out = await submitForCandidate(a, id);
    expect((await respond(await issueCandidateToken(out.referral_id!, a.id))).data).toBe("confirmed");
    const today = sql(`select to_char(now() at time zone 'UTC', 'YYYY-MM-DD')`)[0];
    expect(evidence(out.referral_id!)).toContain(`Candidate email changed on ${today}.`);
    // Dates only: the internal table holds no address.
    expect(sql(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'app' and table_name = 'candidate_email_changes'`)).toEqual(["candidate_id,changed_at,id"]);
  });

  it("adds nothing for an unchanged email or a change more than 30 days earlier", async () => {
    const plain = await submitForCandidate();
    expect((await respond(await issueCandidateToken(plain.referral_id!, a.id))).data).toBe("confirmed");
    expect(evidence(plain.referral_id!)).not.toContain("email changed");

    const id = await cand();
    await a.client.from("candidates").update({ email: `n9-old-${uniq()}@example.com` }).eq("id", id);
    sql(`update app.candidate_email_changes set changed_at = now() - interval '31 days' where candidate_id = '${id}'`);
    const old = await submitForCandidate(a, id);
    expect((await respond(await issueCandidateToken(old.referral_id!, a.id))).data).toBe("confirmed");
    expect(evidence(old.referral_id!)).not.toContain("email changed");
  });

  // QA m-1: retention of the change log.
  it("anonymizing a candidate deletes its change rows and writes none (m-1)", async () => {
    const id = await cand();
    await a.client.from("candidates").update({ email: `n9-pre-anon-${uniq()}@example.com` }).eq("id", id);
    expect(sql(`select count(*) from app.candidate_email_changes where candidate_id = '${id}'`)).toEqual(["1"]);
    expect((await a.client.rpc("anonymize_candidate", { p_candidate: id, p_reason: "erasure request" })).error).toBeNull();
    expect(sql(`select count(*) from app.candidate_email_changes where candidate_id = '${id}'`)).toEqual(["0"]);
  });

  it("the 10-minute maintenance sweep prunes rows older than 60 days and keeps recent ones (m-1)", async () => {
    const oldId = await cand();
    const recentId = await cand();
    await a.client.from("candidates").update({ email: `n9-old61-${uniq()}@example.com` }).eq("id", oldId);
    await a.client.from("candidates").update({ email: `n9-recent-${uniq()}@example.com` }).eq("id", recentId);
    sql(`update app.candidate_email_changes set changed_at = now() - interval '61 days' where candidate_id = '${oldId}'`);
    sql(`update app.candidate_email_changes set changed_at = now() - interval '59 days' where candidate_id = '${recentId}'`);
    const { data, error } = await admin().rpc("purge_presentation_data");
    expect(error).toBeNull();
    expect((data as { email_changes: number }).email_changes).toBeGreaterThanOrEqual(1);
    expect(sql(`select count(*) from app.candidate_email_changes where candidate_id = '${oldId}'`)).toEqual(["0"]);
    expect(sql(`select count(*) from app.candidate_email_changes where candidate_id = '${recentId}'`)).toEqual(["1"]);

    // The worker's maintenance entry point runs the same purge.
    await a.client.from("candidates").update({ email: `n9-old61b-${uniq()}@example.com` }).eq("id", oldId);
    sql(`update app.candidate_email_changes set changed_at = now() - interval '61 days' where candidate_id = '${oldId}'`);
    const { runPresentationMaintenance } = await import("@/server/queue/handlers/claim-evidence");
    await runPresentationMaintenance(admin() as never);
    expect(sql(`select count(*) from app.candidate_email_changes where candidate_id = '${oldId}'`)).toEqual(["0"]);
    expect(sql(`select count(*) from app.candidate_email_changes where changed_at < now() - interval '60 days'`)).toEqual(["0"]);
  });

  it("purge_presentation_data stays service-role only", async () => {
    expect((await a.client.rpc("purge_presentation_data")).error?.message).toMatch(/permission denied for function/);
    expect((await anon().rpc("purge_presentation_data")).error?.message).toMatch(/permission denied for function/);
  });

  it("the change log is unreachable from user roles", async () => {
    expect((await a.client.schema("app" as never).from("candidate_email_changes" as never).select("*")).error).not.toBeNull();
  });
});
