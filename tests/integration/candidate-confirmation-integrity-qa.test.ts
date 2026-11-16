import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { admin, anon, createCandidate, createJob, createOrg, createUser, issueCandidateToken, sql, termsOf, type TestUser } from "./helpers";

/**
 * QA (step 2) for N9 candidate-confirmation integrity (docs/specs/candidate-confirmation-integrity).
 * Adversarial: a recruiter, anon or another org trying to obtain or forge a candidate token or a
 * confirmation; the BR-7/BR-8 migration statement on a pre-N9 state (scenario 8); rotate/issue
 * ordering; replay after rotate; BR-10 edges; BR-11; BR-12 and its internal table.
 * Complements candidate-confirmation-integrity.test.ts (backend, scenarios 1–4 and 9).
 * A = sourcing org (a, a2), B = hiring org, X = unrelated sourcing org, ops = platform admin.
 */

let a: TestUser, a2: TestUser, b: TestUser, x: TestUser, ops: TestUser;
let orgA: { id: string }, orgB: { id: string }, orgX: { id: string };

const API = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const uniq = () => randomUUID().slice(0, 8);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
type Created = { outcome: string; referral_id: string | null; created: boolean; destination: string | null; reference: string | null };

const job = (title = `QA9 Role ${uniq()}`) => createJob(b, orgB.id, { title, client_name: `QA9 Client ${uniq()}` });
const cand = (u: TestUser = a, orgId = orgA.id, over: Record<string, unknown> = {}) => createCandidate(u, orgId, { email: `qa9-${uniq()}@example.com`, ...over });

async function submitForCandidate(u: TestUser = a, candidateId?: string, jobId?: string, orgId = orgA.id) {
  const theJob = jobId ?? (await job());
  const { data, error } = await u.client
    .rpc("submit_referral_for_candidate", {
      p_candidate: candidateId ?? (await cand(u, orgId)), p_job: theJob, p_terms_version: await termsOf(theJob), p_fields: ["headline", "skills"],
      p_document_ids: [], p_idempotency_key: randomUUID(),
    })
    .single();
  if (error) throw new Error(error.message);
  const out = data as Created;
  if (out.outcome !== "created") throw new Error(`not created: ${out.outcome}`);
  return out;
}

const view = async (token: string) => (await anon().rpc("get_candidate_request", { p_token: token })).data as Record<string, unknown> | null;
const respond = async (token: string, accept = true) => {
  const r = await anon().rpc("respond_candidate_request", { p_token: token, p_accept: accept, p_profile: {} as never });
  return r.error ? `error:${r.error.message}` : (r.data as string);
};
const rotate = async (u: TestUser, referralId: string) => {
  const r = await u.client.rpc("rotate_candidate_request_token", { p_referral: referralId, p_ttl_days: 14 });
  return r.error ? `error:${r.error.message}` : (r.data as string);
};
const issue = (referralId: string, actor: string) => admin().rpc("issue_candidate_request_token", { p_referral: referralId, p_actor: actor });
const jwt = async (u: TestUser) => (await u.client.auth.getSession()).data.session!.access_token;
const rest = (p: string, init: RequestInit & { headers?: Record<string, string> } = {}) => fetch(`${API()}/rest/v1/${p}`, init);

// pg_dump must match the local server's major version (17); Homebrew's default may be older.
const PG17 = "/opt/homebrew/opt/postgresql@17/bin/pg_dump";
const PG_DUMP = process.env.PG_DUMP ?? (existsSync(PG17) ? PG17 : "pg_dump");

/** Runs a multi-statement script on the LOCAL database in one psql session and returns `k|v` rows. */
function psqlScript(script: string): Record<string, string> {
  const dbUrl = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(dbUrl).hostname)) throw new Error("psqlScript refused: not local");
  const out = execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-qAt", "-f", "-"], { input: script, encoding: "utf8" });
  return Object.fromEntries(out.split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("|")), l.slice(l.indexOf("|") + 1)]));
}

beforeAll(async () => {
  [a, a2, b, x, ops] = await Promise.all([
    createUser("qa9-a"), createUser("qa9-a2"), createUser("qa9-b"), createUser("qa9-x"), createUser("qa9-ops", { platformAdmin: true }),
  ]);
  orgA = await createOrg(a, "QA9 Agency A");
  orgB = await createOrg(b, "QA9 Hiring B");
  orgX = await createOrg(x, "QA9 Other X");
  // RD-036: a plain recruiter no longer sees a colleague's referrals, so the teammate who acts on
  // a's referrals here is a manager (plain-recruiter denial: recruiter-record-scope.test.ts).
  sql(`insert into public.organization_memberships (organization_id, user_id, role, status) values ('${orgA.id}', '${a2.id}', 'recruiter_manager', 'active')`);
});

beforeEach(() => {
  sql(`delete from app.rate_limits where user_id in ('${a.id}', '${a2.id}', '${b.id}', '${x.id}', '${ops.id}')`);
});

// =============================================================================================
describe("forging a token: issuance is unreachable from every user-session path (BR-1, BR-2, BR-4, scenario 3)", () => {
  it("raw PostgREST: anon key, user JWT, user JWT + secret apikey, GET, and the app schema profile are all refused", async () => {
    const out = await submitForCandidate();
    const body = JSON.stringify({ p_referral: out.referral_id, p_actor: a.id });
    const token = await jwt(a);
    const attempts: Record<string, Response> = {
      anon: await rest("rpc/issue_candidate_request_token", { method: "POST", headers: { apikey: PUB(), "Content-Type": "application/json" }, body }),
      user: await rest("rpc/issue_candidate_request_token", { method: "POST", headers: { apikey: PUB(), Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body }),
      // A user session can never pair itself with the secret key; this checks the defence in depth anyway.
      userWithSecretApikey: await rest("rpc/issue_candidate_request_token", { method: "POST", headers: { apikey: process.env.SUPABASE_SECRET_KEY!, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body }),
      get: await rest(`rpc/issue_candidate_request_token?p_referral=${out.referral_id}&p_actor=${a.id}`, { headers: { apikey: PUB(), Authorization: `Bearer ${token}` } }),
      appProfile: await rest("rpc/issue_candidate_request_token", { method: "POST", headers: { apikey: PUB(), Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Profile": "app" }, body }),
    };
    for (const [name, res] of Object.entries(attempts)) {
      const text = await res.text();
      expect(res.ok, `${name}: ${res.status} ${text}`).toBe(false);
      expect(text, name).not.toMatch(/[A-Za-z0-9_-]{43}"?$/);
    }
    expect((await rest("rpc/issue_candidate_request_token", { method: "POST", headers: { apikey: PUB(), Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body })).status).toBe(403);
    // Nothing was issued by any of them.
    expect(sql(`select (token_hash is null)::text || '|' || (token_issued_at is null)::text from public.referral_candidate_requests where referral_id = '${out.referral_id}'`)).toEqual(["true|true"]);
    expect(sql(`select count(*) from public.audit_events where entity_id = '${out.referral_id}' and action = 'referral.candidate_request_issued'`)).toEqual(["0"]);
  });

  it("no role a recruiter can assume holds EXECUTE on issuance (PUBLIC, anon, authenticated, and any role they're members of)", () => {
    expect(sql(`select coalesce(string_agg(r.rolname, ',' order by r.rolname), 'none') from pg_roles r
                 where has_function_privilege(r.oid, 'public.issue_candidate_request_token(uuid, uuid)', 'execute')
                   and r.rolname in ('anon', 'authenticated', 'authenticator', 'public')`)).toEqual(["none"]);
    // authenticated/anon are not members of service_role (or of any role that could execute it).
    expect(sql(`select count(*) from pg_auth_members m join pg_roles g on g.oid = m.roleid join pg_roles u on u.oid = m.member
                 where u.rolname in ('anon', 'authenticated') and g.rolname in ('service_role', 'postgres', 'supabase_admin')`)).toEqual(["0"]);
    expect(sql(`select p.prosecdef::text || '|' || array_to_string(p.proconfig, ',') from pg_proc p where p.oid = 'public.issue_candidate_request_token(uuid, uuid)'::regprocedure`)).toEqual(["true|search_path=\"\""]);
  });

  it("the only token-shaped arguments left on the API are the candidate's own p_token (get/respond) and invitations; nothing writes token_hash except rotate (null) and issue", () => {
    expect(sql(`select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname in ('public', 'app') and (pg_get_function_identity_arguments(p.oid) ~* 'token|hash')`))
      .toEqual(["accept_invitation,api_key_authenticate,get_candidate_request,respond_candidate_request"]);
    expect(sql(`select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname in ('public', 'app') and p.prosrc ~* 'referral_candidate_requests' and p.prosrc ~* 'token_hash'`))
      .toEqual(["get_candidate_request,issue_candidate_request_token,respond_candidate_request,rotate_candidate_request_token,submit_referral_for_candidate"]);
    // submit only ever inserts a null hash.
    const submitSrc = sql(`select prosrc from pg_proc where oid = 'public.submit_referral_for_candidate(uuid, uuid, text[], uuid[], text, uuid, text, integer, boolean)'::regprocedure`).join("\n");
    expect(submitSrc).toMatch(/'email', c\.email::text, null, p_fields/);
    expect(submitSrc).not.toMatch(/digest|gen_random_bytes/);
  });

  it("every dropped-signature call shape is PGRST202 (named, partial, GET, with and without the other args)", async () => {
    const out = await submitForCandidate();
    const h = sha(randomBytes(32).toString("base64url"));
    const calls = [
      a.client.rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_token_hash: h } as never),
      a.client.rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_token_hash: h, p_ttl_days: 30 } as never),
      a.client.rpc("submit_referral_for_candidate", { p_candidate: await cand(), p_job: await job(), p_fields: ["skills"], p_document_ids: [], p_idempotency_key: randomUUID(), p_token_hash: h, p_note: null, p_ttl_days: 14, p_acknowledge_pending: true } as never),
      anon().rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_token_hash: h } as never),
    ];
    for (const r of await Promise.all(calls)) expect(r.error?.code).toBe("PGRST202");
    const get = await rest(`rpc/rotate_candidate_request_token?p_referral=${out.referral_id}&p_token_hash=${h}`, { headers: { apikey: PUB(), Authorization: `Bearer ${await jwt(a)}` } });
    expect(get.ok).toBe(false);
    expect(sql(`select token_hash is null from public.referral_candidate_requests where referral_id = '${out.referral_id}'`)).toEqual(["t"]);
  });

  it("a recruiter can't write the request row at all (insert/update/delete, token_issued_at included)", async () => {
    const out = await submitForCandidate();
    const t = await issueCandidateToken(out.referral_id!, a.id);
    const upd = await a.client.from("referral_candidate_requests").update({ token_issued_at: new Date().toISOString() } as never).eq("referral_id", out.referral_id!).select("referral_id");
    expect(upd.error?.code).toBe("42501");
    const upd2 = await a.client.from("referral_candidate_requests").update({ expires_at: new Date(Date.now() + 9e9).toISOString() } as never).eq("referral_id", out.referral_id!).select("referral_id");
    expect(upd2.error?.code).toBe("42501");
    const ins = await a.client.from("referral_candidate_requests").insert({ referral_id: out.referral_id!, organization_id: orgA.id, candidate_id: randomUUID(), channel: "email", destination: "x@example.com", requested_fields: ["skills"], expires_at: new Date(Date.now() + 9e8).toISOString() } as never);
    expect(ins.error?.code).toBe("42501");
    const del = await a.client.from("referral_candidate_requests").delete().eq("referral_id", out.referral_id!).select("referral_id");
    expect(del.error?.code).toBe("42501");
    expect(sql(`select token_hash from public.referral_candidate_requests where referral_id = '${out.referral_id}'`)).toEqual([sha(t)]);
  });
});

// =============================================================================================
describe("reading the token or hash (BR-3, scenario 4)", () => {
  it("token_hash can't be selected, filtered, ordered, embedded or counted by a recruiter (no hash oracle)", async () => {
    const out = await submitForCandidate();
    const t = await issueCandidateToken(out.referral_id!, a.id);
    const h = sha(t);
    const headers = { apikey: PUB(), Authorization: `Bearer ${await jwt(a)}` };
    const probes = [
      `referral_candidate_requests?select=token_hash`,
      `referral_candidate_requests?select=referral_id&token_hash=eq.${h}`,
      `referral_candidate_requests?select=referral_id&token_hash=is.null`,
      `referral_candidate_requests?select=referral_id&or=(token_hash.like.${h.slice(0, 4)}*)`,
      `referral_candidate_requests?select=referral_id&order=token_hash`,
      `referrals?select=id,referral_candidate_requests(token_hash)&id=eq.${out.referral_id}`,
      `referrals?select=id,referral_candidate_requests!inner(referral_id)&referral_candidate_requests.token_hash=eq.${h}`,
    ];
    for (const p of probes) {
      const res = await rest(p, { headers });
      const text = await res.text();
      expect(res.ok, `${p} → ${res.status} ${text}`).toBe(false);
      expect(text).not.toContain(h);
    }
    const head = await rest(`referral_candidate_requests?select=referral_id&token_hash=eq.${h}`, { method: "HEAD", headers: { ...headers, Prefer: "count=exact" } });
    expect(head.ok).toBe(false);
    // The source org reads the issuance columns; nobody else reads the row at all.
    const own = await a2.client.from("referral_candidate_requests").select("token_issued_at, token_issued_by").eq("referral_id", out.referral_id!).single();
    expect(own.data?.token_issued_by).toBe(a.id);
    for (const u of [b, x, ops]) {
      const r = await u.client.from("referral_candidate_requests").select("referral_id, token_issued_at, token_issued_by, destination").eq("referral_id", out.referral_id!);
      expect(r.data ?? [], u.email).toEqual([]);
    }
    expect((await anon().from("referral_candidate_requests").select("token_issued_at").limit(1)).error).not.toBeNull();
  });

  it("the anon candidate RPCs never echo the token, the hash, the issuer or the issue time", async () => {
    const out = await submitForCandidate();
    const t = await issueCandidateToken(out.referral_id!, a.id);
    const page = JSON.stringify(await view(t));
    for (const s of [t, sha(t), a.id, "token_issued", "token_hash"]) expect(page).not.toContain(s);
    const bad = await anon().rpc("respond_candidate_request", { p_token: t.slice(0, 42) + (t.endsWith("A") ? "B" : "A"), p_accept: true, p_profile: {} as never });
    expect(bad.error?.message).toBe("not_found");
    expect(JSON.stringify(bad.error)).not.toMatch(/[0-9a-f]{64}/);
  });

  it("a full flow leaves the token nowhere in the database, and the hash only on its own request row (DB-wide dump grep)", async () => {
    const out = await submitForCandidate();
    const t1 = await issueCandidateToken(out.referral_id!, a.id);
    expect(await rotate(a, out.referral_id!)).toBe(out.destination);
    const t2 = await issueCandidateToken(out.referral_id!, a.id);
    // The candidate edits a field (profile_changes) on confirm, with meta, through the real RPC.
    const ok = await anon().rpc("respond_candidate_request", { p_token: t2, p_accept: true, p_profile: { headline: "QA9 edited" } as never, p_meta: { ip: "203.0.113.9", user_agent: "qa9" } as never });
    expect(ok.data).toBe("confirmed");
    const dec = await submitForCandidate();
    const t3 = await issueCandidateToken(dec.referral_id!, a.id);
    expect(await respond(t3, false)).toBe("declined");

    // Stream the dump through grep -F: a long-lived local stack outgrows Node's max string length
    // (0x1fffffe8) for a full in-memory dump. Only lines holding a token or a hash are kept, which is all
    // the assertions below read. public.matches (millions of score rows: ids, numbers and skill
    // explanations computed by the matcher, never request data) is skipped so the dump stays short; a
    // multi-minute dump let the client's idle keep-alive socket drop and broke the next test.
    const needles = [t1, t2, t3, sha(t1), sha(t2), sha(t3)];
    const dump = execFileSync("sh", ["-c", '"$0" "$1" --data-only --no-owner --exclude-table-data=public.matches | grep -F -e "$2" -e "$3" -e "$4" -e "$5" -e "$6" -e "$7" || true',
      PG_DUMP, "postgresql://postgres:postgres@127.0.0.1:55322/postgres", ...needles], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
    for (const s of [t1, t2, t3]) expect(dump.includes(s), "raw token in DB").toBe(false);
    expect(dump.includes(sha(t1)), "rotated-out hash kept somewhere").toBe(false);
    // Each live hash appears exactly once: on its own referral_candidate_requests row.
    for (const [s, ref] of [[sha(t2), out.referral_id], [sha(t3), dec.referral_id]] as const) {
      const lines = dump.split("\n").filter((l) => l.includes(s));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(ref!);
    }
    // pg_stat_statements keeps normalized texts only.
    const stmts = sql(`select count(*) from extensions.pg_stat_statements where query like '%${t2.slice(0, 20)}%' or query like '%${sha(t2).slice(0, 20)}%'`);
    expect(stmts).toEqual(["0"]);
  }, 300_000); // a full data dump of a long-lived local stack takes longer than the 30 s default

  it("issuance audit holds only the send number; resend audit is {}; neither is visible to the hiring side", async () => {
    const out = await submitForCandidate();
    await issueCandidateToken(out.referral_id!, a.id);
    await rotate(a, out.referral_id!);
    await issueCandidateToken(out.referral_id!, a2.id);
    const { data } = await a.client.from("audit_events").select("action, actor_id, metadata").eq("entity_id", out.referral_id!).order("id");
    const issued = data!.filter((e) => e.action === "referral.candidate_request_issued");
    expect(issued.map((e) => [e.actor_id, e.metadata])).toEqual([[a.id, { send_number: 1 }], [a2.id, { send_number: 2 }]]);
    expect(data!.filter((e) => e.action === "referral.candidate_request_resent").map((e) => e.metadata)).toEqual([{}]);
    expect((await b.client.from("audit_events").select("id").eq("entity_id", out.referral_id!)).data ?? []).toEqual([]);
    // No notification is created by issuing or resending.
    expect(sql(`select count(*) from public.notifications where link like '%${out.referral_id}%'`)).toEqual(["0"]);
  });
});

// =============================================================================================
describe("timing and ordering between rotate and issue; replay (BR-5, scenario 6)", () => {
  it("two parallel issuances on a fresh request: exactly one token, the other token_already_issued", async () => {
    for (let i = 0; i < 5; i++) {
      const out = await submitForCandidate();
      const rs = await Promise.all([issue(out.referral_id!, a.id), issue(out.referral_id!, a2.id), issue(out.referral_id!, a.id)]);
      const tokens = rs.filter((r) => !r.error).map((r) => r.data as string);
      expect(tokens).toHaveLength(1);
      expect(rs.filter((r) => r.error).map((r) => r.error!.message)).toEqual(["token_already_issued", "token_already_issued"]);
      expect(sql(`select token_hash from public.referral_candidate_requests where referral_id = '${out.referral_id}'`)).toEqual([sha(tokens[0])]);
      expect(sql(`select count(*) from public.audit_events where entity_id = '${out.referral_id}' and action = 'referral.candidate_request_issued'`)).toEqual(["1"]);
    }
  });

  it("rotate racing issue: a returned token is either the live one or dead; never a second live link", async () => {
    for (let i = 0; i < 8; i++) {
      const out = await submitForCandidate();
      const [rot, iss] = await Promise.all([rotate(a, out.referral_id!), issue(out.referral_id!, a.id)]);
      expect(rot).toBe(out.destination);
      const row = sql(`select coalesce(token_hash, 'null') || '|' || coalesce(token_issued_at::text, 'null') from public.referral_candidate_requests where referral_id = '${out.referral_id}'`)[0];
      if (iss.error) {
        expect(row).toMatch(/^null\|null$/);
      } else {
        const t = iss.data as string;
        const live = row.startsWith(sha(t));
        // Rotate after issue → hash null and t dead; issue after rotate → t is the live link.
        expect(live || row.startsWith("null|null")).toBe(true);
        expect((await view(t))?.state ?? null).toBe(live ? "pending" : null);
      }
    }
  });

  it("an old link is dead after rotate for view, accept and decline, and stays dead after the new link is used", async () => {
    const out = await submitForCandidate();
    const t1 = await issueCandidateToken(out.referral_id!, a.id);
    await rotate(a, out.referral_id!);
    // Between rotate and issue (the crash window) no link works and issuance is allowed again.
    expect(await view(t1)).toBeNull();
    expect(await respond(t1, true)).toBe("error:not_found");
    expect(await respond(t1, false)).toBe("error:not_found");
    const t2 = await issueCandidateToken(out.referral_id!, a.id);
    expect(await view(t1)).toBeNull();
    expect(await respond(t1, false)).toBe("error:not_found");
    expect(await respond(t2, true)).toBe("confirmed");
    expect(await view(t1)).toBeNull();
    expect(await respond(t1, true)).toBe("error:not_found");
    expect((await view(t2))?.state).toBe("confirmed");
  });

  it("another org (or the hiring side) can't kill a live link or re-arm someone else's request", async () => {
    const out = await submitForCandidate();
    const t = await issueCandidateToken(out.referral_id!, a.id);
    for (const u of [x, b, ops]) expect(await rotate(u, out.referral_id!)).toBe("error:forbidden");
    expect((await anon().rpc("rotate_candidate_request_token", { p_referral: out.referral_id!, p_ttl_days: 14 })).error).not.toBeNull();
    expect((await view(t))?.state).toBe("pending");
    // Issuing for A's referral with an X actor, the hiring actor or the platform admin is refused (BR-5, R-4).
    for (const u of [x, b, ops]) expect((await issue(out.referral_id!, u.id)).error?.message).toBe("forbidden");
  });

  // N10 (BR-13, BR-34.1, settlement mode): a suspended org keeps its in-flight referrals, including the
  // candidate-request resend. Superseded the pre-N10 assertion ("neither rotate nor issue"). A member
  // whose own membership is deactivated still gets nothing.
  it("a suspended source org (settlement mode) can still resend; a deactivated member can't", async () => {
    const s = await createUser("qa9-susp");
    const orgS = await createOrg(s, "QA9 Suspended");
    const out = await submitForCandidate(s, await cand(s, orgS.id), await job(), orgS.id);
    sql(`update public.organizations set suspended_at = now() where id = '${orgS.id}'`);
    try {
      expect(await rotate(s, out.referral_id!)).toBe(out.destination);
      expect((await issue(out.referral_id!, s.id)).error).toBeNull();
      sql(`update public.organization_memberships set status = 'suspended' where organization_id = '${orgS.id}' and user_id = '${s.id}'`);
      expect((await issue(out.referral_id!, s.id)).error?.message).toBe("forbidden");
    } finally {
      sql(`update public.organizations set suspended_at = null where id = '${orgS.id}'`);
    }
  });
});

// =============================================================================================
describe("BR-10 resend limit edges", () => {
  it("a rate-limited rotate changes nothing: the live link survives; another member still has their own 10", async () => {
    const out = await submitForCandidate();
    for (let i = 0; i < 10; i++) expect(await rotate(a, out.referral_id!)).toBe(out.destination);
    const t = await issueCandidateToken(out.referral_id!, a.id);
    const before = sql(`select expires_at::text from public.referral_candidate_requests where referral_id = '${out.referral_id}'`);
    expect(await rotate(a, out.referral_id!)).toBe("error:rate_limited");
    expect((await view(t))?.state).toBe("pending");
    expect(sql(`select expires_at::text from public.referral_candidate_requests where referral_id = '${out.referral_id}'`)).toEqual(before);
    expect(sql(`select count(*) from public.audit_events where entity_id = '${out.referral_id}' and action = 'referral.candidate_request_resent'`)).toEqual(["10"]);
    expect(await rotate(a2, out.referral_id!)).toBe(out.destination); // per user
  });

  it("refused rotates (forbidden, closed) don't burn the caller's window (D-1); the Server Action no longer consumes the bucket itself", async () => {
    const theirs = await submitForCandidate(x, await cand(x, orgX.id), await job(), orgX.id);
    for (let i = 0; i < 12; i++) expect(await rotate(a, theirs.referral_id!)).toBe("error:forbidden");
    expect(sql(`select coalesce(sum(hits), 0) from app.rate_limits where user_id = '${a.id}' and bucket = 'referral.candidate_resend'`)).toEqual(["0"]);
    const src = readFileSync(path.resolve(import.meta.dirname, "../../src/features/referrals/actions.ts"), "utf8");
    expect(src).not.toMatch(/rateLimit\([^)]*candidate_resend/);
  });
});

// =============================================================================================
describe("scenario 8: the migration's BR-7/BR-8 statement on a pre-N9 state", () => {
  const MIGRATION = readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/20261115000100_candidate_confirmation_integrity.sql"), "utf8");
  const STATEMENT = MIGRATION.slice(MIGRATION.indexOf("with expired as ("), MIGRATION.indexOf("from expired e;") + "from expired e;".length);

  it("expires only unanswered in-date pre-N9 requests, audits each once, leaves answered/expired/issued rows byte-identical (BR-7, BR-8, D-4)", async () => {
    expect(STATEMENT).toMatch(/^with expired as \([\s\S]+'n9_token_reset'[\s\S]+from expired e;$/);
    // Pre-N9 shapes: a caller-chosen hash and no token_issued_at.
    const K = { p: randomBytes(32).toString("base64url"), x: randomBytes(32).toString("base64url"), old: randomBytes(32).toString("base64url") };
    const P = (await submitForCandidate()).referral_id!; // pending, in date
    const PX = (await submitForCandidate(x, await cand(x, orgX.id), await job(), orgX.id)).referral_id!; // another org's pending
    const OLD = (await submitForCandidate()).referral_id!; // already expired before N9
    const C = (await submitForCandidate()).referral_id!; // confirmed pre-N9
    const D = (await submitForCandidate()).referral_id!; // declined pre-N9
    const L = (await submitForCandidate()).referral_id!; // a post-N9 live link (control)
    const tc = await issueCandidateToken(C, a.id);
    expect(await respond(tc, true)).toBe("confirmed");
    const td = await issueCandidateToken(D, a.id);
    expect(await respond(td, false)).toBe("declined");
    const tl = await issueCandidateToken(L, a.id);
    sql(`update public.referral_candidate_requests set token_hash = '${sha(K.p)}', token_issued_at = null, token_issued_by = null where referral_id = '${P}'`);
    sql(`update public.referral_candidate_requests set token_hash = '${sha(K.x)}', token_issued_at = null, token_issued_by = null where referral_id = '${PX}'`);
    sql(`update public.referral_candidate_requests set token_hash = '${sha(K.old)}', token_issued_at = null, token_issued_by = null, expires_at = now() - interval '2 days' where referral_id = '${OLD}'`);
    sql(`update public.referral_candidate_requests set token_issued_at = null, token_issued_by = null where referral_id in ('${C}', '${D}')`);
    const all = [P, PX, OLD, C, D, L].map((id) => `'${id}'`).join(",");
    const untouched = [OLD, C, D, L].map((id) => `'${id}'`).join(",");

    // Seed → statement → assertions in one transaction, then ROLLBACK (the statement is global).
    const r = psqlScript(`
      begin;
      create temp table qa_out (k text, v text);
      insert into qa_out select 'before', string_agg(referral_id || '=' || md5(to_jsonb(q)::text), ',' order by referral_id) from public.referral_candidate_requests q where referral_id in (${untouched});
      insert into qa_out select 'beforeRef', string_agg(id || '=' || md5(to_jsonb(r)::text), ',' order by id) from public.referrals r where id in (${all});
      insert into qa_out select 'beforeConsents', md5(string_agg(to_jsonb(k)::text, ',' order by id)) from public.candidate_consents k where organization_id = '${orgA.id}';
      ${STATEMENT}
      insert into qa_out select 'after', string_agg(referral_id || '=' || md5(to_jsonb(q)::text), ',' order by referral_id) from public.referral_candidate_requests q where referral_id in (${untouched});
      insert into qa_out select 'afterRef', string_agg(id || '=' || md5(to_jsonb(r)::text), ',' order by id) from public.referrals r where id in (${all});
      insert into qa_out select 'afterConsents', md5(string_agg(to_jsonb(k)::text, ',' order by id)) from public.candidate_consents k where organization_id = '${orgA.id}';
      insert into qa_out select 'row:' || referral_id, (expires_at <= now())::text || '|' || coalesce(token_issued_at::text, 'null') || '|' || coalesce(token_hash, 'null')
        from public.referral_candidate_requests where referral_id in ('${P}', '${PX}');
      insert into qa_out select 'audit:' || id, (select count(*) || '|' || coalesce(string_agg(coalesce(e.actor_id::text, 'null') || '|' || e.organization_id || '|' || e.entity_type || '|' || e.metadata::text, ';'), '')
        from public.audit_events e where e.action = 'referral.candidate_request_invalidated' and e.entity_id = ids.id) from (select unnest(array[${all}]::uuid[]) id) ids;
      insert into qa_out values ('get:p', public.get_candidate_request('${K.p}')::text), ('get:x', public.get_candidate_request('${K.x}')->>'state'),
                                ('get:old', public.get_candidate_request('${K.old}')->>'state'), ('get:c', public.get_candidate_request('${tc}')->>'state'),
                                ('get:d', public.get_candidate_request('${td}')->>'state');
      do $$ begin perform public.respond_candidate_request('${K.p}', true, '{}', null, '{}'); insert into qa_out values ('resp:p:accept', 'ok');
                  exception when others then insert into qa_out values ('resp:p:accept', sqlerrm); end $$;
      do $$ begin perform public.respond_candidate_request('${K.p}', false, '{}', null, '{}'); insert into qa_out values ('resp:p:decline', 'ok');
                  exception when others then insert into qa_out values ('resp:p:decline', sqlerrm); end $$;
      insert into qa_out values ('get:l', public.get_candidate_request('${tl}')->>'state');
      insert into qa_out select 'status:' || id, status::text from public.referrals where id in ('${P}', '${PX}');
      select k || '|' || coalesce(v, '') from qa_out;
      rollback;
    `);

    // Pending pre-N9 requests: ended now, still never issued, hash kept so the old link resolves to "expired".
    for (const [id, k] of [[P, K.p], [PX, K.x]] as const) expect(r[`row:${id}`]).toBe(`true|null|${sha(k)}`);
    const pageP = JSON.parse(r["get:p"]) as Record<string, unknown>;
    expect(pageP.state).toBe("expired");
    expect(pageP).not.toHaveProperty("candidate");
    expect(pageP).not.toHaveProperty("fields");
    expect(r["get:x"]).toBe("expired");
    expect(r["resp:p:accept"]).toBe("request_expired");
    expect(r["resp:p:decline"]).toBe("request_expired");
    expect(r[`status:${P}`]).toBe("awaiting_candidate"); // the recruiter can resend
    // One audit row per expired request: actor null, the source org, reason n9_token_reset.
    expect(r[`audit:${P}`]).toBe(`1|null|${orgA.id}|referral|{"reason": "n9_token_reset"}`);
    expect(r[`audit:${PX}`]).toBe(`1|null|${orgX.id}|referral|{"reason": "n9_token_reset"}`);
    for (const id of [OLD, C, D, L]) expect(r[`audit:${id}`], id).toBe("0|");
    // Answered, already-expired and post-N9 issued rows are byte-identical; referrals and consents untouched.
    expect(r.after).toBe(r.before);
    expect(r.afterRef).toBe(r.beforeRef);
    expect(r.afterConsents).toBe(r.beforeConsents);
    expect([r["get:old"], r["get:c"], r["get:d"], r["get:l"]]).toEqual(["expired", "confirmed", "declined", "pending"]);
    // Rolled back: the live rows are as seeded.
    expect(sql(`select count(*) from public.audit_events where action = 'referral.candidate_request_invalidated' and entity_id in (${all})`)).toEqual(["0"]);
  });

  it("an invalidated request (post-migration shape) isn't pending for N1 until resent; after a resend it is again (BR-11, PD-032)", async () => {
    const shared = `qa9-br11-${uniq()}@example.com`;
    const j = await job();
    const p = (await submitForCandidate(x, await cand(x, orgX.id, { email: shared }), j, orgX.id)).referral_id!;
    const probe = await cand(a, orgA.id, { email: shared });
    const check = () => sql(`select outcome from app.presentation_check('${probe}', '${j}', null)`);
    expect(check()).toEqual(["pending"]);
    // Exactly the state BR-7 leaves behind: legacy hash, never issued, expires_at = migration time.
    sql(`update public.referral_candidate_requests set token_hash = '${sha(randomBytes(32).toString("base64url"))}', token_issued_at = null, expires_at = now() where referral_id = '${p}'`);
    await new Promise((res) => setTimeout(res, 20));
    expect(check()).toEqual(["clear"]);
    // A resend (no stop check) makes it pending again with fresh fingerprints, before any new link is issued.
    expect(await rotate(x, p)).toBe(shared);
    expect(check()).toEqual(["pending"]);
    expect(sql(`select count(*) > 0 from app.referral_fingerprints where referral_id = '${p}'`)).toEqual(["t"]);
  });
});

// =============================================================================================
describe("BR-12 and app.candidate_email_changes", () => {
  const evidence = (referralId: string) =>
    sql(`select k.evidence from public.candidate_consents k join public.referral_candidate_requests q on q.consent_id = k.id where q.referral_id = '${referralId}'`)[0];

  it("is closed to every PostgREST role: no table grants, RLS on with no policies, trigger function not executable, schema not exposed", async () => {
    expect(sql(`select coalesce(string_agg(grantee || ':' || privilege_type, ','), 'none') from information_schema.role_table_grants
                 where table_schema = 'app' and table_name = 'candidate_email_changes' and grantee in ('anon', 'authenticated', 'PUBLIC', 'authenticator')`)).toEqual(["none"]);
    expect(sql(`select has_table_privilege('authenticated', 'app.candidate_email_changes', 'select') or has_table_privilege('anon', 'app.candidate_email_changes', 'select')
                    or has_table_privilege('authenticated', 'app.candidate_email_changes', 'insert') or has_table_privilege('authenticated', 'app.candidate_email_changes', 'delete')`)).toEqual(["f"]);
    expect(sql(`select relrowsecurity::text || '|' || (select count(*) from pg_policies where schemaname = 'app' and tablename = 'candidate_email_changes') from pg_class where oid = 'app.candidate_email_changes'::regclass`)).toEqual(["true|0"]);
    expect(sql(`select has_function_privilege('authenticated', 'app.on_candidate_email_change()', 'execute') or has_function_privilege('anon', 'app.on_candidate_email_change()', 'execute')`)).toEqual(["f"]);
    expect(sql(`select has_sequence_privilege('authenticated', s.oid, 'usage') from pg_class s where s.relkind = 'S' and s.relname like 'candidate_email_changes%'`)).toEqual(["f"]);
    const res = await rest("candidate_email_changes?select=*", { headers: { apikey: PUB(), Authorization: `Bearer ${await jwt(a)}`, "Accept-Profile": "app" } });
    expect(res.ok).toBe(false);
    expect((await rest("candidate_email_changes?select=*", { headers: { apikey: PUB(), Authorization: `Bearer ${await jwt(a)}` } })).ok).toBe(false);
    // Columns: dates and ids only.
    expect(sql(`select string_agg(column_name || ':' || data_type, ',' order by column_name) from information_schema.columns where table_schema = 'app' and table_name = 'candidate_email_changes'`))
      .toEqual(["candidate_id:uuid,changed_at:timestamp with time zone,id:bigint"]);
  });

  it("logs real changes only (not same value, not case-only on citext, not other columns) and prunes rows older than 60 days on the next change", async () => {
    const id = await cand();
    const count = () => sql(`select count(*) from app.candidate_email_changes where candidate_id = '${id}'`)[0];
    expect(count()).toBe("0"); // creation doesn't count (D-8)
    const cur = (await admin().from("candidates").select("email").eq("id", id).single()).data!.email!;
    await a.client.from("candidates").update({ email: cur }).eq("id", id);
    await a.client.from("candidates").update({ email: cur.toUpperCase() }).eq("id", id);
    await a.client.from("candidates").update({ headline: "Changed headline" }).eq("id", id);
    expect(count()).toBe("0");
    await a.client.from("candidates").update({ email: `qa9-n-${uniq()}@example.com` }).eq("id", id);
    expect(count()).toBe("1");
    sql(`insert into app.candidate_email_changes (candidate_id, changed_at) values ('${id}', now() - interval '61 days'), ('${id}', now() - interval '59 days')`);
    await a.client.from("candidates").update({ email: `qa9-m-${uniq()}@example.com` }).eq("id", id);
    expect(sql(`select string_agg(extract(day from now() - changed_at)::int::text, ',' order by changed_at) from app.candidate_email_changes where candidate_id = '${id}'`)).toEqual(["59,0,0"]);
  });

  it("a change before a resend counts against the new issuance; a change after issuance isn't claimed; the boundary is 30 days", async () => {
    // Change between t1 and the resend: the confirmed link (t2) was issued after it.
    const id = await cand();
    const out = await submitForCandidate(a, id);
    await issueCandidateToken(out.referral_id!, a.id);
    const newEmail = `qa9-resent-${uniq()}@example.com`;
    await a.client.from("candidates").update({ email: newEmail }).eq("id", id);
    expect(await rotate(a, out.referral_id!)).toBe(newEmail);
    expect(await respond(await issueCandidateToken(out.referral_id!, a.id))).toBe("confirmed");
    const today = sql(`select to_char(now() at time zone 'UTC', 'YYYY-MM-DD')`)[0];
    expect(evidence(out.referral_id!)).toContain(`emailed to ${newEmail} (issued `);
    expect(evidence(out.referral_id!)).toContain(`Candidate email changed on ${today}.`);

    // Change after issuance (link already went to the old address): not claimed.
    const id2 = await cand();
    const o2 = await submitForCandidate(a, id2);
    const t2 = await issueCandidateToken(o2.referral_id!, a.id);
    await a.client.from("candidates").update({ email: `qa9-after-${uniq()}@example.com` }).eq("id", id2);
    expect(await respond(t2)).toBe("confirmed");
    expect(evidence(o2.referral_id!)).not.toContain("email changed");

    // 29 days before issuance counts (with that date); 31 days doesn't.
    for (const [days, expected] of [[29, true], [31, false]] as const) {
      const cid = await cand();
      await a.client.from("candidates").update({ email: `qa9-d${days}-${uniq()}@example.com` }).eq("id", cid);
      sql(`update app.candidate_email_changes set changed_at = now() - interval '${days} days' where candidate_id = '${cid}'`);
      const o = await submitForCandidate(a, cid);
      expect(await respond(await issueCandidateToken(o.referral_id!, a.id))).toBe("confirmed");
      const date = sql(`select to_char((now() - interval '${days} days') at time zone 'UTC', 'YYYY-MM-DD')`)[0];
      if (expected) expect(evidence(o.referral_id!)).toContain(`Candidate email changed on ${date}.`);
      else expect(evidence(o.referral_id!)).not.toContain("email changed");
    }
  });

  it("the evidence never carries an address other than the destination (dates only from the change log)", async () => {
    const id = await cand();
    const oldEmail = (await admin().from("candidates").select("email").eq("id", id).single()).data!.email!;
    await a.client.from("candidates").update({ email: `qa9-new-${uniq()}@example.com` }).eq("id", id);
    const o = await submitForCandidate(a, id);
    expect(await respond(await issueCandidateToken(o.referral_id!, a.id))).toBe("confirmed");
    expect(evidence(o.referral_id!)).not.toContain(oldEmail);
  });

  // m-1 fixed (20261115000200): anonymization deletes the candidate's rows; the sweep prunes > 60 days.
  it("m-1 fixed: anonymizing a candidate leaves no change rows", async () => {
    const m = await createUser("qa9-anon");
    const orgM = await createOrg(m, "QA9 Anon Org");
    const id = await cand(m, orgM.id);
    await m.client.from("candidates").update({ email: `qa9-pre-anon-${uniq()}@example.com` }).eq("id", id);
    expect((await m.client.rpc("anonymize_candidate", { p_candidate: id, p_reason: "erasure request" })).error).toBeNull();
    expect(sql(`select count(*) from app.candidate_email_changes where candidate_id = '${id}'`)).toEqual(["0"]);
  });
});
