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
  "resolve_dispute", "review_payment_evidence", "submit_referral",
  "transition_referral",
  // Referral review & match triage (20261108000200/000300): each checks org membership internally.
  "review_referral", "decline_referrals", "decline_pending_for_job", "set_match_triage", "mark_matches_seen",
  // Sent-referral job status (20261109000200): checks org membership internally.
  "get_sent_referral_jobs",
  // Candidate-confirmed referrals (20261111000200): source-org membership checked internally.
  // (Pre-existing gap in this list, closed with N1.) N9 (20261115000100): neither takes a token or
  // token hash any more. Never allow-list issue_candidate_request_token: it returns the raw
  // candidate token and is service_role only (BR-2).
  "submit_referral_for_candidate", "rotate_candidate_request_token",
  // Token-only candidate page RPCs; also callable by anon (see ANON_RPCS).
  "get_candidate_request", "respond_candidate_request",
  // N1 duplicate and prior-presentation protection (20261113000400–000700). Each resolves the side
  // from the caller's membership + acting org and answers "not found" otherwise; admin ones check
  // app.is_platform_admin(). Never allow-list the service-role ones: claim_evidence_scan_target,
  // record_claim_evidence_scan, finalize_due_claims, purge_presentation_data, purge_orphan_claim_files,
  // forget_claim_files, rotate_fingerprint_key.
  "withdraw_referral", "release_referral",
  "register_claim_evidence", "list_claim_evidence_files", "remove_claim_evidence", "authorize_claim_evidence",
  "list_claim_evidence_referrals", "file_prior_presentation_claim", "get_referral_presentation",
  "contest_prior_presentation_claim",
  "resolve_prior_presentation_dispute", "get_referral_dispute", "compare_dispute_contacts",
  "presentation_admin_metrics", "presentation_abuse_flags",
  // PD-033 / m-5 (20261113001000): platform-admin lookup of a stop by its support reference.
  "get_stop_by_reference",
  // N2 job terms card (20261116000200): save_job_terms re-checks job edit rights (owner or manager) and is
  // the only path that publishes a terms version or opens a job; get_jobs_terms_state checks membership.
  "save_job_terms", "get_jobs_terms_state",
  // N2 drop 2 (20261116000400): admin_* check app.is_platform_admin(); get_referral_terms_context checks
  // app.can_see_referral (either side, record scope).
  "admin_amend_referral_terms", "admin_get_referral_terms", "get_referral_terms_context",
  // N3 drop 1 (20261117000300–000500). report_hire re-checks the hiring side (record scope); complete_fee_details
  // likewise; get_referral_hire_state answers either side or "not found"; admin_* check app.is_platform_admin()
  // and answer "not found" otherwise. N3 BR-2: record_candidate_request_delivery is service_role only now (the
  // app's email path), like issue_candidate_request_token. Never allow-list run_hire_maintenance (service role).
  "complete_fee_details", "get_referral_hire_state", "admin_get_hire_record", "admin_set_hire_record_note",
  "admin_list_hire_tasks", "admin_record_fee_notice",
  // N3 drop 2 (20261117000700–000900). Member RPCs resolve the side from the acting org (record scope) and answer
  // not_found / the generic hire_report_unavailable otherwise; admin_* check app.is_platform_admin(). Never
  // allow-list the service-role ones: hire_evidence_scan_target, record_hire_evidence_scan, purge_orphan_hire_files.
  "file_hire_report", "contest_hire_report", "rebut_hire_report", "get_hire_reports",
  "register_hire_evidence", "list_hire_evidence_files", "remove_hire_evidence", "authorize_hire_evidence",
  "request_authorization_check", "submit_authorization_evidence",
  "admin_list_hire_reports", "admin_hire_report_flags", "admin_get_hire_report", "admin_set_hire_report_fields",
  "admin_decide_hire_report", "admin_open_authorization_check", "admin_decide_authorization_check", "admin_get_authorization_checks",
  "get_placement_fee_state",
  // N10 Network Rules enforcement (20261116001000–001700). set_organization_suspension is dropped
  // (BR-29): never re-add it. Member RPCs re-check membership / side from auth.uid() and answer
  // not_found; admin_* and the rules publishing RPCs check app.is_platform_admin(). Never allow-list
  // the service-role ones: conduct_evidence_scan_target, record_conduct_evidence_scan,
  // purge_orphan_conduct_files.
  "accept_network_rules", "save_network_rules_draft", "delete_network_rules_draft", "publish_network_rules_version",
  "admin_list_network_rules", "admin_get_network_rules_version",
  "get_my_org_state", "list_my_organizations", "get_partner_job_availability",
  "deactivate_member_in_settlement", "get_settlement_summary", "admin_close_stale_referral",
  "register_conduct_evidence", "list_conduct_draft_files", "remove_conduct_draft_file", "authorize_conduct_evidence",
  "get_conduct_report_context", "file_conduct_report", "list_my_conduct_reports", "get_conduct_report",
  "reply_conduct_info_request",
  "admin_list_conduct_cases", "admin_get_conduct_case", "admin_set_conduct_category", "admin_request_conduct_info",
  "admin_close_conduct_case", "admin_open_conduct_case", "admin_conduct_notice_context", "admin_send_conduct_notice",
  "admin_send_conduct_followup", "get_conduct_case_for_org", "submit_conduct_response", "reply_conduct_followup",
  "admin_decide_conduct_case", "admin_apply_immediate_hold", "admin_lift_sanction", "request_sanction_review",
  "admin_decide_sanction_review", "admin_conduct_incident_options", "admin_send_incident_notice", "get_incident_notice",
  "get_network_standing", "admin_org_conduct_file",
]);

// The only RPCs anon may execute: the candidate's confirmation page, where the token is the
// credential (checked by hash inside the database). N1 runs the delivery re-check in there.
const ANON_RPCS = new Set(["get_candidate_request", "respond_candidate_request"]);

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
      if (ANON_RPCS.has(fn)) {
        if (privilegeDenied(error)) open.push(`${fn}: denied but anon-allow-listed`);
        continue;
      }
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
