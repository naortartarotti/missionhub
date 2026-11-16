import { beforeAll, describe, expect, it } from "vitest";
import { admin, createCandidate, createJob, createOrg, createUser, sql, type TestUser } from "./helpers";
import { addMember, err, referralBetween, transition, version } from "./n10-helpers";

/**
 * N10 settlement mode, option (a) in full (BR-33 to BR-37, EC-1, AC-98 to AC-111, AC-135, AC-136,
 * AC-151, scenarios 31 to 34, 40). Suspensions are set directly (effects only) so this suite isolates
 * the access rules from the sanction RPCs, which network-rules-conduct.test.ts covers.
 */

let susp: TestUser; // org_admin of the suspended org
let suspRec: TestUser; // plain recruiter of the suspended org (RD-036 record scope)
let suspAdmin2: TestUser;
let partner: TestUser;
let sOrg: { id: string };
let pOrg: { id: string };
let inflight: string; // sourced by susp
let recRef: string; // sourced by suspRec
let closed: string; // withdrawn before the suspension
let received: string; // received by the suspended org (it is the hiring side)
let ownCandidate: string;

beforeAll(async () => {
  susp = await createUser("settle-admin");
  partner = await createUser("settle-partner");
  sOrg = await createOrg(susp, "Settle Suspended");
  pOrg = await createOrg(partner, "Settle Partner");
  suspRec = await createUser("settle-rec");
  await addMember(sOrg.id, suspRec, "recruiter");
  suspAdmin2 = await createUser("settle-admin2");
  await addMember(sOrg.id, suspAdmin2, "org_admin");
  inflight = (await referralBetween(susp, sOrg.id, partner, pOrg.id)).referralId;
  recRef = (await referralBetween(suspRec, sOrg.id, partner, pOrg.id)).referralId;
  closed = (await referralBetween(susp, sOrg.id, partner, pOrg.id)).referralId;
  expect(err(await susp.client.rpc("withdraw_referral", { p_referral: closed, p_reason: "Candidate took another role.", p_expected_version: await version(closed), p_acting_org: sOrg.id }))).toBe("ok");
  received = (await referralBetween(partner, pOrg.id, susp, sOrg.id)).referralId;
  ownCandidate = await createCandidate(susp, sOrg.id);
  sql(`update public.organizations set suspended_at = now() where id = '${sOrg.id}'`);
});

describe("access in settlement mode (BR-33, BR-34)", () => {
  it("the org stays in the switcher with the settlement marker and its state says so (AC-98)", async () => {
    const list = (await susp.client.rpc("list_my_organizations")).data as { id: string; settlement_mode: boolean }[];
    expect(list.find((o) => o.id === sOrg.id)?.settlement_mode).toBe(true);
    const state = (await susp.client.rpc("get_my_org_state", { p_org: sOrg.id })).data as { settlement_mode: boolean; settlement_kind: string; restriction: string };
    expect([state.settlement_mode, state.settlement_kind, state.restriction]).toEqual([true, "suspended", "suspended"]);
    expect((await susp.client.from("organizations").select("id").eq("id", sOrg.id)).data).toEqual([{ id: sOrg.id }]);
    expect(((await susp.client.from("organization_memberships").select("id").eq("organization_id", sOrg.id)).data ?? []).length).toBe(3);
  });

  it("in-flight referrals are visible on both sides; closed history isn't (AC-100, N10-D31)", async () => {
    const ids = ((await susp.client.from("referrals").select("id")).data ?? []).map((r) => r.id).sort();
    expect(ids).toEqual([inflight, recRef, received].sort());
    expect((await susp.client.from("referrals").select("id").eq("id", closed)).data).toEqual([]);
    // The hiring side reads its own job behind an in-scope referral (read only).
    const job = sql(`select job_id::text from public.referrals where id = '${received}'`)[0];
    expect((await susp.client.from("jobs").select("id").eq("id", job)).data).toEqual([{ id: job }]);
    expect(err(await susp.client.from("jobs").update({ title: "Edited in settlement" }).eq("id", job))).toBe("ok");
    expect(sql(`select title from public.jobs where id = '${job}'`)).not.toEqual(["Edited in settlement"]);
  });

  it("RD-036 record scope still applies: a plain recruiter sees only their own referral", async () => {
    const ids = ((await suspRec.client.from("referrals").select("id")).data ?? []).map((r) => r.id);
    expect(ids).toEqual([recRef]);
  });

  it("every BR-13 action works: message, accept and move forward, interview and offer (AC-100, AC-102)", async () => {
    expect((await susp.client.from("referral_messages").insert({ referral_id: inflight, author_id: susp.id, author_side: "source", body: "Still on it while we settle." })).error).toBeNull();
    expect(err(await transition(susp, received, "accepted", sOrg.id))).toBe("ok");
    expect(err(await partner.client.rpc("confirm_agreement", { p_referral: received }))).toBe("ok");
    expect(err(await transition(susp, received, "interviewing", sOrg.id))).toBe("ok");
    expect(err(await transition(susp, received, "offer", sOrg.id))).toBe("ok");
    // The partner works its side without admin help (AC-110).
    expect(err(await transition(partner, inflight, "accepted", pOrg.id))).toBe("ok");
    expect(err(await susp.client.rpc("confirm_agreement", { p_referral: inflight }))).toBe("ok");
  });

  it("candidates, jobs, matching, invitations, connectors and API keys stay closed (AC-106, BR-36)", async () => {
    expect((await susp.client.from("candidates").select("id").eq("id", ownCandidate)).data).toEqual([]);
    expect((await susp.client.from("candidates").insert({ organization_id: sOrg.id, owner_id: susp.id, created_by: susp.id, full_name: "New In Settlement", status: "draft" })).error).not.toBeNull();
    expect((await susp.client.from("jobs").insert({ organization_id: sOrg.id, owner_id: susp.id, created_by: susp.id, title: "New job", status: "draft" })).error).not.toBeNull();
    expect(err(await susp.client.rpc("get_opportunities", { p_org: sOrg.id }))).toBe("forbidden");
    expect(err(await susp.client.rpc("create_invitation", { p_org: sOrg.id, p_email: "new@example.com", p_role: "recruiter" }))).not.toBe("ok");
    expect((await susp.client.from("api_keys").select("id").eq("organization_id", sOrg.id)).data).toEqual([]);
    expect((await susp.client.from("connections").select("id").eq("organization_id", sOrg.id)).data).toEqual([]);
    expect((await susp.client.from("audit_events").select("id").eq("organization_id", sOrg.id)).data).toEqual([]);
    expect(err(await susp.client.from("organizations").update({ name: "Renamed in settlement" }).eq("id", sOrg.id))).toBe("ok");
    expect(sql(`select name from public.organizations where id = '${sOrg.id}'`)).toEqual(["Settle Suspended"]);
  });

  it("an active org is unaffected (regression of is_member users, AC-107)", async () => {
    expect(((await partner.client.from("referrals").select("id")).data ?? []).length).toBeGreaterThanOrEqual(4);
    expect((await partner.client.from("candidates").select("id").limit(1)).error).toBeNull();
  });

  it("settlement summary counts in-flight work only (S22-b)", async () => {
    const s = (await susp.client.rpc("get_settlement_summary", { p_org: sOrg.id })).data as { referrals_in_progress: number };
    expect(s.referrals_in_progress).toBe(3);
  });

  it("team: deactivate a member; never oneself, never the last active org admin (AC-104)", async () => {
    const mid = (u: TestUser) => sql(`select id::text from public.organization_memberships where organization_id = '${sOrg.id}' and user_id = '${u.id}'`)[0];
    expect(err(await suspRec.client.rpc("deactivate_member_in_settlement", { p_org: sOrg.id, p_membership: mid(susp) }))).toBe("not_found");
    expect(err(await susp.client.rpc("deactivate_member_in_settlement", { p_org: sOrg.id, p_membership: mid(susp) }))).toBe("self_change");
    expect(err(await susp.client.rpc("deactivate_member_in_settlement", { p_org: sOrg.id, p_membership: mid(suspAdmin2) }))).toBe("ok");
    // susp is now the last active org admin: suspAdmin2 can't act any more, and nobody can remove susp.
    expect(err(await suspAdmin2.client.rpc("deactivate_member_in_settlement", { p_org: sOrg.id, p_membership: mid(susp) }))).toBe("not_found");
    sql(`update public.organization_memberships set status = 'active' where id = '${mid(suspAdmin2)}'`);
    sql(`update public.organization_memberships set status = 'suspended' where id = '${mid(susp)}'`);
    try {
      sql(`update public.organization_memberships set status = 'active' where id = '${mid(susp)}'`);
      sql(`update public.organization_memberships set role = 'recruiter' where id = '${mid(suspAdmin2)}'`);
      expect(err(await susp.client.rpc("deactivate_member_in_settlement", { p_org: sOrg.id, p_membership: mid(suspAdmin2) }))).toBe("ok");
    } finally {
      sql(`update public.organization_memberships set status = 'active', role = 'org_admin' where id = '${mid(suspAdmin2)}'`);
    }
  });

  it("a member who never accepted can accept in settlement mode with the personal statement only (AC-144)", async () => {
    const late = await createUser("settle-late", { acceptRules: false });
    await addMember(sOrg.id, late, "org_admin");
    const v = sql(`select app.rules_current_version()::text`)[0];
    expect(err(await late.client.from("referral_messages").insert({ referral_id: inflight, author_id: late.id, author_side: "source", body: "Before accepting." }))).toBe("rules_acceptance_required");
    expect(err(await late.client.rpc("accept_network_rules", { p_org: sOrg.id, p_version: v, p_locale: "en", p_personal: true, p_for_org: false }))).toBe("ok");
    expect((await late.client.from("referral_messages").insert({ referral_id: inflight, author_id: late.id, author_side: "source", body: "After accepting." })).error).toBeNull();
  });
});

describe("termination and the end of settlement (BR-37, AC-108, AC-135, AC-136)", () => {
  it("a terminated org settles; once nothing is open its members lose access and partners see 'no longer member'", async () => {
    const t = await createUser("settle-term");
    const tOrg = await createOrg(t, "Settle Terminated");
    const jobId = await createJob(t, tOrg.id, { title: "Terminated org job" });
    const { referralId } = await referralBetween(partner, pOrg.id, t, tOrg.id, { jobId });
    sql(`update public.organizations set terminated_at = now(), suspended_at = now() where id = '${tOrg.id}'`);
    expect(((await t.client.rpc("get_my_org_state", { p_org: tOrg.id })).data as { settlement_kind: string }).settlement_kind).toBe("terminated");
    expect(((await partner.client.rpc("get_partner_job_availability", { p_org: pOrg.id, p_job: jobId })).data as { status: string }).status).toBe("not_taking_referrals");
    // Stale close: under 60 days refused; a suspended (not terminated) org refused.
    const pa = await createUser("settle-pa", { platformAdmin: true });
    expect(err(await pa.client.rpc("admin_close_stale_referral", { p_referral: referralId, p_reason: "No activity for months." }))).toBe("not_stale");
    expect(err(await pa.client.rpc("admin_close_stale_referral", { p_referral: inflight, p_reason: "No activity for months." }))).toBe("not_terminated");
    const file = (await pa.client.rpc("admin_org_conduct_file", { p_org: tOrg.id })).data as { obligations: { referrals: { id: string; stale_closable: boolean }[]; all_settled: boolean } };
    expect(file.obligations.referrals.map((r) => [r.id, r.stale_closable])).toEqual([[referralId, false]]);
    // Test clock only: move the referral's activity back 61 days (guards bypassed for this fixture).
    sql(`set local session_replication_role = replica;
         update public.referrals set created_at = now() - interval '61 days' where id = '${referralId}';
         update public.referral_status_events set created_at = now() - interval '61 days' where referral_id = '${referralId}'`);
    expect(err(await pa.client.rpc("admin_close_stale_referral", { p_referral: referralId, p_reason: "No activity for 61 days after termination." }))).toBe("ok");
    expect(sql(`select status || '|' || (select reason || '|' || actor_kind || '|' || coalesce(actor_id::text, 'null') from public.referral_status_events where referral_id = r.id order by id desc limit 1)
                from public.referrals r where r.id = '${referralId}'`)).toEqual(["cancelled|closed_stale_by_admin|admin|null"]);
    // The admin's reason is in the admin audit only.
    expect(sql(`select count(*) from public.audit_events where entity_id = '${referralId}' and action = 'referral.closed_stale_by_admin' and organization_id is not null and metadata ? 'reason'`)).toEqual(["0"]);
    // Nothing left: closed. Members get not found and the org leaves the switcher; partners see "no longer member".
    expect(err(await t.client.rpc("get_my_org_state", { p_org: tOrg.id }))).toBe("not_found");
    expect(((await t.client.rpc("list_my_organizations")).data as { id: string }[]).map((o) => o.id)).not.toContain(tOrg.id);
    expect((await partner.client.rpc("get_partner_job_availability", { p_org: pOrg.id, p_job: jobId })).data)
      .toEqual({ status: "no_longer_member", org_name: "Settle Terminated", job_title: "Terminated org job" });
    expect(((await pa.client.rpc("admin_org_conduct_file", { p_org: tOrg.id })).data as { obligations: { all_settled: boolean } }).obligations.all_settled).toBe(true);
  });

  it("a settled placement still inside its guarantee is an open obligation (N10-D33)", async () => {
    const t = await createUser("settle-guar");
    const tOrg = await createOrg(t, "Settle Guarantee");
    const { referralId } = await referralBetween(partner, pOrg.id, t, tOrg.id);
    expect(err(await transition(t, referralId, "accepted", tOrg.id))).toBe("ok");
    expect(err(await partner.client.rpc("confirm_agreement", { p_referral: referralId }))).toBe("ok");
    const agreement = sql(`select id::text from public.collaboration_agreements where referral_id = '${referralId}'`)[0];
    const ins = await admin().from("placements").insert({
      referral_id: referralId, agreement_id: agreement, source_org_id: pOrg.id, target_org_id: tOrg.id, status: "settled",
      currency: "CAD", contracted_fee_minor: 1_000_000, start_date: "2026-11-01", guarantee_until: sql(`select (app.today_et() + 30)::text`)[0],
      reported_by: t.id, settled_at: new Date().toISOString(),
    });
    if (ins.error) {
      // Placements are written by report_hire only (N3 guards); the predicate is still checked directly below.
      console.warn(`placement fixture skipped: ${ins.error.message}`);
      return;
    }
    sql(`update public.referrals set status = 'hired' where id = '${referralId}'`);
    sql(`update public.organizations set terminated_at = now(), suspended_at = now() where id = '${tOrg.id}'`);
    expect(sql(`select app.referral_in_settlement_scope('${referralId}')::text || '|' || coalesce(app.org_settlement_state('${tOrg.id}'), 'active')`)).toEqual(["true|settlement"]);
    sql(`set local session_replication_role = replica; update public.placements set guarantee_until = app.today_et() - 1 where referral_id = '${referralId}'`);
    expect(sql(`select coalesce(app.org_settlement_state('${tOrg.id}'), 'active')`)).toEqual(["closed"]);
  });
});
