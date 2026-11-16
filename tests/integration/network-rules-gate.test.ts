import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, createCandidate, createJob, createOrg, createUser, currentRulesVersion, sql, type TestUser } from "./helpers";
import { addMember, err, referralBetween, transition } from "./n10-helpers";

/**
 * N10 first-access gate in the database (BR-7, N10-D13, AC-19, AC-143, scenarios 3 and 41).
 * A user who never accepted any version can't write anything outside the exempt list: direct
 * PostgREST writes, writing RPCs and storage uploads are refused with rules_acceptance_required.
 */

let owner: TestUser;
let gated: TestUser;
let org: { id: string; slug: string };
let partner: TestUser;
let pOrg: { id: string };

beforeAll(async () => {
  owner = await createUser("gate-owner");
  org = await createOrg(owner, "Gate Org");
  gated = await createUser("gate-new-member", { acceptRules: false });
  await addMember(org.id, gated, "org_admin");
  partner = await createUser("gate-partner");
  pOrg = await createOrg(partner, "Gate Partner");
});

describe("a member who never accepted any version (BR-7)", () => {
  it("is gated in get_my_org_state", async () => {
    const s = (await gated.client.rpc("get_my_org_state", { p_org: org.id })).data as { rules: { gate_required: boolean; member_accepted_any: boolean } };
    expect(s.rules.gate_required).toBe(true);
    expect(s.rules.member_accepted_any).toBe(false);
  });

  it("can't insert, update or delete through PostgREST", async () => {
    const ins = await gated.client.from("candidates").insert({ organization_id: org.id, owner_id: gated.id, created_by: gated.id, full_name: "Blocked Candidate", status: "draft" });
    expect(err(ins)).toBe("rules_acceptance_required");
    const jobId = await createJob(owner, org.id, { accepts_external_referrals: false });
    expect(err(await gated.client.from("jobs").update({ title: "Changed by a gated user" }).eq("id", jobId))).toBe("rules_acceptance_required");
    expect(sql(`select title from public.jobs where id = '${jobId}'`)).not.toEqual(["Changed by a gated user"]);
    expect(err(await gated.client.from("organizations").update({ name: "Renamed" }).eq("id", org.id))).toBe("rules_acceptance_required");
    expect(err(await gated.client.from("profiles").update({ full_name: "Renamed Me" }).eq("id", gated.id))).toBe("rules_acceptance_required");
    expect(err(await gated.client.from("notification_preferences").insert({ user_id: gated.id, kind: "referral.status", in_app: false }))).toBe("rules_acceptance_required");
    // Even a zero-row write is refused (statement-level).
    expect(err(await gated.client.from("match_feedback").delete().eq("user_id", gated.id))).toBe("rules_acceptance_required");
  });

  it("can't call writing RPCs", async () => {
    const jobId = await createJob(owner, org.id, { accepts_external_referrals: false });
    expect(err(await gated.client.rpc("create_invitation", { p_org: org.id, p_email: `x-${randomUUID().slice(0, 6)}@example.com`, p_role: "recruiter" }))).toBe("rules_acceptance_required");
    const save = await gated.client.rpc("save_job_terms", {
      p_job: jobId, p_open: false, p_fee_basis: "pct_base", p_rate_bps: 2000, p_search_type: "contingent_shared", p_attested: true,
      p_guarantee_days: 90, p_guarantee_remedy: "replacement_then_prorata", p_payment_terms_days: 30, p_ownership_months: 6,
    });
    expect(err(save)).toBe("rules_acceptance_required");
    // A referral the org received: the gated admin can't move it.
    const { referralId } = await referralBetween(partner, pOrg.id, owner, org.id);
    expect(err(await transition(gated, referralId, "accepted", org.id))).toBe("rules_acceptance_required");
    expect(sql(`select status from public.referrals where id = '${referralId}'`)).toEqual(["submitted"]);
    // N10 RPCs that write are gated too (conduct report).
    const r = await gated.client.rpc("file_conduct_report", {
      p_org: org.id, p_referral: referralId, p_match: null as unknown as string, p_category: "other", p_description: "A report from a gated user.",
      p_occurred_on: null as unknown as string, p_occurred_approx: false, p_attested: true, p_file_ids: [],
    });
    expect(err(r)).toBe("rules_acceptance_required");
  });

  it("can't upload to storage", async () => {
    const candidateId = await createCandidate(owner, org.id);
    const up = await gated.client.storage.from("candidate-documents").upload(`${org.id}/${candidateId}/${randomUUID()}.pdf`, new Uint8Array([37, 80, 68, 70]), { contentType: "application/pdf" });
    expect(up.error).not.toBeNull();
    const conduct = await gated.client.storage.from("conduct-evidence").upload(`${org.id}/${gated.id}/${randomUUID()}.pdf`, new Uint8Array([37, 80, 68, 70]), { contentType: "application/pdf" });
    expect(conduct.error).not.toBeNull();
  });

  it("can still use the exempt list: mark notifications read, accept an invitation, create an org, accept the rules", async () => {
    sql(`insert into public.notifications (user_id, organization_id, kind, title) values ('${gated.id}', '${org.id}', 'test.kind', 'Hello')`);
    expect(err(await gated.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", gated.id))).toBe("ok");
    expect(sql(`select count(*) from public.notifications where user_id = '${gated.id}' and read_at is null`)).toEqual(["0"]);

    // Invitation accepted before the gate (the gate starts once the membership exists).
    const invited = await createUser("gate-invited", { acceptRules: false });
    const { data: token } = await owner.client.rpc("create_invitation", { p_org: org.id, p_email: invited.email, p_role: "recruiter" });
    expect(err(await invited.client.rpc("accept_invitation", { p_token: token as string }))).toBe("ok");
    const s = (await invited.client.rpc("get_my_org_state", { p_org: org.id })).data as { rules: { gate_required: boolean } };
    expect(s.rules.gate_required).toBe(true);

    // Creating an org records the acceptance itself.
    const founder = await createUser("gate-founder", { acceptRules: false });
    const created = await founder.client.rpc("create_organization", {
      p_name: "Gate Founder", p_slug: `gate-f-${randomUUID().slice(0, 6)}`, p_rules_version: await currentRulesVersion(), p_rules_locale: "en",
      p_accept_org: true, p_accept_member: true,
    });
    expect(created.error).toBeNull();

    // Accepting lifts the gate; writes work afterwards.
    const acc = await gated.client.rpc("accept_network_rules", { p_org: org.id, p_version: await currentRulesVersion(), p_locale: "pt-BR", p_personal: true, p_for_org: false });
    expect(err(acc)).toBe("ok");
    expect(err(await gated.client.from("profiles").update({ full_name: "Accepted Now" }).eq("id", gated.id))).toBe("ok");
  });

  it("platform admins are never gated in the database (BR-11)", async () => {
    const pa = await createUser("gate-platform", { platformAdmin: true, acceptRules: false });
    const caseId = await pa.client.rpc("admin_open_conduct_case", {
      p_org: org.id, p_category: "other", p_admin_source: "other", p_referral: null as unknown as string,
      p_description: "Opened by a platform admin who never accepted.", p_file_ids: [],
    });
    expect(caseId.error).toBeNull();
  });
});

// =============================================================================================
// Generated coverage: a new table or a new writing function can't skip the gate (AC-143).
// =============================================================================================
describe("gate coverage over the catalog (AC-143)", () => {
  // Tables deliberately outside the gate (BR-7 exempt list / not user writes).
  const EXEMPT_TABLES = new Set([
    "public.notifications", "public.audit_events", "public.background_jobs", "public.matches",
    "public.network_rules_versions", "public.network_rules_version_texts",
    "public.network_rules_org_acceptances", "public.network_rules_member_acceptances",
    "app.rate_limits",
    // app tables written only as side effects of gated public writes, or by service-role / admin paths.
    "app.candidate_email_changes", "app.country_calling_codes", "app.job_client_keys", "app.network_holidays",
    "app.presentation_config", "app.presentation_hits", "app.referral_commit_keys", "app.referral_fingerprints",
    "app.referral_presentations", "app.sticky_stops", "app.terms_amendment_notes",
  ]);

  it("every public table outside the exempt list carries the gate trigger", () => {
    const missing = sql(`
      select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p') and n.nspname = 'public'
         and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'zz_rules_gate')
       order by 1`).filter((t) => !EXEMPT_TABLES.has(t));
    expect(missing).toEqual([]);
  });

  it("every table a public or app function writes is gated or explicitly exempt", () => {
    // Direct writes found in function bodies; indirect writes go through these same app functions.
    const rows = sql(`
      select distinct lower(m[2]) from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
             regexp_matches(p.prosrc, '(insert\\s+into|update|delete\\s+from)\\s+((public|app)\\.[a-z_]+)', 'gi') m
       where n.nspname in ('public', 'app')`);
    const gated = new Set(sql(`
      select n.nspname || '.' || c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace where t.tgname = 'zz_rules_gate'`));
    const ungated = rows.filter((t) => !gated.has(t) && !EXEMPT_TABLES.has(t));
    expect(ungated).toEqual([]);
  });

  it("the gate exemption flag is set only by the documented exempt RPCs", () => {
    const setters = sql(`
      select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'app') and p.prosrc like '%app.rules_gate_exempt%' and p.proname <> 'rules_gate_ok'
       order by 1`);
    expect(setters).toEqual([
      "public.accept_invitation", "public.accept_network_rules", "public.create_organization",
      "public.get_candidate_request", "public.respond_candidate_request",
    ]);
  });

  it("set_organization_suspension no longer exists (BR-29, N10-D15)", () => {
    expect(sql(`select count(*) from pg_proc where proname = 'set_organization_suspension'`)).toEqual(["0"]);
  });

  it("a client can't set the exemption flag through PostgREST", async () => {
    const u = await createUser("gate-forger", { acceptRules: false });
    const o = await createOrg(owner, "Gate Forgery");
    await addMember(o.id, u, "org_admin");
    const r = await u.client.rpc("set_config" as never, { setting_name: "app.rules_gate_exempt", new_value: "on", is_local: false } as never);
    expect(r.error).not.toBeNull();
    expect(err(await u.client.from("organizations").update({ name: "Forged" }).eq("id", o.id))).toBe("rules_acceptance_required");
    expect((await admin().from("organizations").select("name").eq("id", o.id).single()).data!.name).toBe("Gate Forgery");
  });
});
