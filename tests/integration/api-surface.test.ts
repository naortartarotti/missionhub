import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anon, createOrg, createUser, type TestUser } from "./helpers";

/**
 * PostgREST is reachable by anyone holding the publishable key, so its exposed tables and RPCs
 * are part of the public API even though the app never calls them from the browser.
 * These tests discover the surface from PostgREST's own OpenAPI document, so a new table or
 * function that ships with open grants fails here.
 */

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
let tables: string[] = [];
let rpcs: string[] = [];
const rpcArgs: Record<string, Record<string, unknown>> = {};

type Prop = { format?: string; type?: string };
/** Type-correct dummy arguments, so PostgREST resolves the function and Postgres checks EXECUTE. */
const dummy = (p: Prop): unknown => {
  const f = p.format ?? "";
  if (f === "uuid") return randomUUID();
  if (f.endsWith("[]") || p.type === "array") return [];
  if (f === "boolean" || p.type === "boolean") return false;
  if (f === "integer" || f === "bigint" || p.type === "integer" || p.type === "number") return 1;
  if (f === "date") return "2026-01-01";
  if (f.startsWith("public.")) return null;
  return "x";
};
const privilegeDenied = (e: { message: string } | null) => !!e && /permission denied for (function|table|schema)/.test(e.message);
let user: TestUser;

// Only these RPCs may be executed by a signed-in user. Everything else is service_role only.
const AUTHENTICATED_RPCS = new Set([
  "accept_invitation", "anonymize_candidate", "audit_document_access", "authorize_referral_document",
  "confirm_agreement", "consume_rate_limit", "create_invitation", "create_organization",
  "get_job_match_summary", "get_opportunities", "open_dispute", "platform_metrics",
  "publish_commission_rule", "record_invoice", "record_payment_evidence", "report_hire",
  "resolve_dispute", "review_payment_evidence", "set_organization_suspension", "submit_referral",
  "transition_referral",
  // Referral review & match triage (20261108000200/000300): each checks org membership internally.
  "review_referral", "decline_referrals", "decline_pending_for_job", "set_match_triage", "mark_matches_seen",
]);

beforeAll(async () => {
  const res = await fetch(`${url()}/rest/v1/`, { headers: { apikey: process.env.SUPABASE_SECRET_KEY!, Accept: "application/openapi+json" } });
  const spec = (await res.json()) as { paths: Record<string, { post?: { parameters?: { schema?: { properties?: Record<string, Prop> } }[] } }> };
  const paths = Object.keys(spec.paths).filter((p) => p !== "/");
  rpcs = paths.filter((p) => p.startsWith("/rpc/")).map((p) => p.slice(5));
  tables = paths.filter((p) => !p.startsWith("/rpc/")).map((p) => p.slice(1));
  for (const fn of rpcs) {
    const props = spec.paths[`/rpc/${fn}`].post?.parameters?.find((x) => x.schema)?.schema?.properties ?? {};
    rpcArgs[fn] = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, dummy(v)]));
  }
  user = await createUser("surface");
  await createOrg(user, "Surface Org");
});

describe("anonymous callers (publishable key only)", () => {
  it("discovered the API surface", () => {
    expect(tables.length).toBeGreaterThan(20);
    expect(rpcs).toContain("submit_referral");
  });

  it("cannot read any table", async () => {
    const open: string[] = [];
    for (const t of tables) {
      const { data, error } = await anon().from(t as never).select("*").limit(1);
      if (!error && (data?.length ?? 0) > 0) open.push(t);
      if (!error) open.push(`${t} (no error)`);
    }
    expect(open).toEqual([]);
  });

  it("cannot write any table", async () => {
    const open: string[] = [];
    for (const t of tables) {
      const { error } = await anon().from(t as never).insert({} as never);
      if (!error || !/permission denied|42501/.test(`${error.message} ${error.code}`)) open.push(`${t}: ${error?.code ?? "inserted"}`);
    }
    expect(open).toEqual([]);
  });

  it("cannot execute any RPC", async () => {
    const open: string[] = [];
    for (const fn of rpcs) {
      const { error } = await anon().rpc(fn as never, rpcArgs[fn] as never);
      if (!privilegeDenied(error)) open.push(`${fn}: ${error?.code ?? "ok"} ${error?.message ?? ""}`);
    }
    expect(open).toEqual([]);
  });
});

describe("signed-in users", () => {
  it("can only execute the allow-listed RPCs", async () => {
    const unexpected: string[] = [];
    for (const fn of rpcs) {
      const { error } = await user.client.rpc(fn as never, rpcArgs[fn] as never);
      if (error?.code === "PGRST202") unexpected.push(`${fn}: could not build arguments`);
      const denied = privilegeDenied(error);
      if (AUTHENTICATED_RPCS.has(fn) === denied) unexpected.push(`${fn}: ${denied ? "denied but allow-listed" : "callable but not allow-listed"}`);
    }
    expect(unexpected).toEqual([]);
  });

  it("cannot reach the internal app schema", async () => {
    const { error } = await user.client.schema("app" as never).rpc("audit" as never, {} as never);
    expect(error).not.toBeNull();
  });

  it.each(["matches", "background_jobs"])("cannot read or write %s directly", async (t) => {
    const read = await user.client.from(t as never).select("*").limit(1);
    expect(read.error?.code).toBe("42501");
    const write = await user.client.from(t as never).insert({} as never);
    expect(write.error?.code).toBe("42501");
  });

  it.each(["audit_events", "notifications", "organizations", "organization_memberships", "organization_invitations", "profiles"])(
    "cannot insert into %s outside the RPCs",
    async (t) => {
      const { error } = await user.client.from(t as never).insert({} as never);
      expect(error?.code).toBe("42501");
    },
  );

  it("can only change read_at on notifications", async () => {
    const { error } = await user.client.from("notifications").update({ title: "x" } as never).eq("user_id", user.id);
    expect(error?.code).toBe("42501");
  });

  it("is rate limited per user and bucket", async () => {
    const bucket = `test.${randomUUID().slice(0, 8)}`;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push((await user.client.rpc("consume_rate_limit", { p_bucket: bucket, p_limit: 3, p_window_seconds: 3600 })).data as boolean);
    expect(results).toEqual([true, true, true, false]);
    const other = await createUser("surface-other");
    const { data } = await other.client.rpc("consume_rate_limit", { p_bucket: bucket, p_limit: 3, p_window_seconds: 3600 });
    expect(data).toBe(true); // quotas are per user
    const bad = await user.client.rpc("consume_rate_limit", { p_bucket: "Bad Bucket!", p_limit: 3, p_window_seconds: 60 });
    expect(bad.error).not.toBeNull();
  });
});
