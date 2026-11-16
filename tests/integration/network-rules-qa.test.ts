import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, createCandidate, createJob, createOrg, createUser, sql, type TestUser } from "./helpers";
import {
  addMember, adminCase, closeWindow, currentVersion, decide, err, immediateHold, liftAll, referralBetween, sendNotice, today, trySubmit, version,
} from "./n10-helpers";

/**
 * N10 QA (adversarial). Complements the backend suites (network-rules-*.test.ts) with:
 * IDOR with forged org / case / notice / follow-up / referral / match ids (AC-116, BR-41), reporter
 * identity (BR-43, AC-69, AC-113), restriction reason vs partners (BR-42, AC-49, AC-50), settlement
 * scope (BR-34, BR-36, N10-D31), sanction-ladder bypass (BR-27 to BR-31), DB input validation,
 * `conduct-evidence` storage policies (BR-16, BR-43), first-access gate holes (BR-7, AC-143) and a
 * non-tautological BR-19 / AC-62 check.
 *
 * Every assertion is scoped to orgs created here (the local stack is shared with other sessions).
 * `it.fails` marks a reproduced product bug (QA-N10-xx in qa-report.md): it passes while the bug is
 * present and turns red once fixed; then drop `.fails`.
 */

let pa: TestUser; // platform admin A
let pb: TestUser; // platform admin B
let sAdmin: TestUser; // sourcing org admin
let sRec: TestUser; // sourcing recruiter (the reporter)
let tAdmin: TestUser; // hiring (reported) org admin
let tRec: TestUser; // hiring recruiter
let xAdmin: TestUser; // unrelated org admin
let sOrg: { id: string; slug: string };
let tOrg: { id: string; slug: string };
let xOrg: { id: string; slug: string };
let referralId: string; // sRec (S) -> T
let jobId: string;
let caseId: string; // reported by sRec about T
let noticeId: string;
let followupId: string;
const REPORT_TEXT = `QA-N10 secret report text ${randomUUID().slice(0, 8)}: they forwarded the CV elsewhere.`;
const S_NAME = `QA Sourcing ${randomUUID().slice(0, 6)}`;

const pdf = () => new TextEncoder().encode(`%PDF-1.4\n% qa ${randomUUID()}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);

const fileReport = (u: TestUser, org: string, over: Record<string, unknown> = {}) =>
  u.client.rpc("file_conduct_report", {
    p_org: org, p_referral: referralId, p_match: null as unknown as string, p_category: "shared_outside",
    p_description: REPORT_TEXT, p_occurred_on: today(), p_occurred_approx: false, p_attested: true, p_file_ids: [], ...over,
  } as never);

beforeAll(async () => {
  pa = await createUser("qa10-pa", { platformAdmin: true });
  pb = await createUser("qa10-pb", { platformAdmin: true });
  sAdmin = await createUser("qa10-s-admin");
  tAdmin = await createUser("qa10-t-admin");
  xAdmin = await createUser("qa10-x-admin");
  sOrg = await createOrg(sAdmin, S_NAME);
  tOrg = await createOrg(tAdmin, "QA Hiring");
  xOrg = await createOrg(xAdmin, "QA Outsider");
  sRec = await createUser("qa10-s-rec");
  await addMember(sOrg.id, sRec, "recruiter");
  tRec = await createUser("qa10-t-rec");
  await addMember(tOrg.id, tRec, "recruiter");
  const r = await referralBetween(sRec, sOrg.id, tAdmin, tOrg.id);
  referralId = r.referralId;
  jobId = r.jobId;
  const filed = await fileReport(sRec, sOrg.id);
  if (filed.error) throw new Error(filed.error.message);
  caseId = (filed.data as { case_id: string }).case_id;
  expect(err(await pa.client.rpc("admin_set_conduct_category", { p_case: caseId, p_category: "shared_outside" }))).toBe("ok");
  noticeId = await sendNotice(pa, caseId, ["2.3"]);
  expect(err(await pa.client.rpc("admin_send_conduct_followup", { p_notice: noticeId, p_question: "Who at your agency handled this candidate?", p_due_business_days: 5 }))).toBe("ok");
  followupId = sql(`select id::text from app.conduct_followups where notice_id = '${noticeId}'`)[0];
}, 300_000);

// ---------------------------------------------------------------------------------------------
describe("IDOR: forged org and object ids (AC-116, BR-41)", () => {
  it("an unrelated org's admin gets a bare not_found from every member RPC, with S / T ids", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["get_conduct_report", { p_org: xOrg.id, p_case: caseId }],
      ["get_conduct_report", { p_org: sOrg.id, p_case: caseId }],
      ["get_conduct_case_for_org", { p_org: xOrg.id, p_case: caseId }],
      ["get_conduct_case_for_org", { p_org: tOrg.id, p_case: caseId }],
      ["submit_conduct_response", { p_org: xOrg.id, p_notice: noticeId, p_body: "Forged response from an unrelated org.", p_file_ids: [] }],
      ["submit_conduct_response", { p_org: tOrg.id, p_notice: noticeId, p_body: "Forged response from an unrelated org.", p_file_ids: [] }],
      ["reply_conduct_followup", { p_org: xOrg.id, p_followup: followupId, p_body: "Forged follow-up reply from outside.", p_file_ids: [] }],
      ["reply_conduct_followup", { p_org: tOrg.id, p_followup: followupId, p_body: "Forged follow-up reply from outside.", p_file_ids: [] }],
      ["request_sanction_review", { p_org: tOrg.id, p_case: caseId, p_text: "Forged review request from outside.", p_file_ids: [] }],
      ["reply_conduct_info_request", { p_org: sOrg.id, p_case: caseId, p_body: "Forged reply to an info request.", p_file_ids: [] }],
      ["get_conduct_report_context", { p_org: xOrg.id, p_referral: referralId }],
      ["get_conduct_report_context", { p_org: sOrg.id, p_referral: referralId }],
      ["get_network_standing", { p_org: tOrg.id }],
      ["get_my_org_state", { p_org: tOrg.id }],
      ["get_settlement_summary", { p_org: tOrg.id }],
      ["list_my_conduct_reports", { p_org: sOrg.id, p_scope: "org" }],
    ];
    for (const [fn, args] of calls) {
      const r = await xAdmin.client.rpc(fn as never, args as never);
      expect.soft(r.error?.message, `${fn} ${JSON.stringify(args)}`).toBe("not_found");
      // No data in the error (details / hint), whatever the RPC.
      expect.soft(JSON.stringify(r.error ?? {}), fn).not.toMatch(new RegExp(`${tOrg.id}|${sOrg.id}|${S_NAME}|QA Hiring`));
    }
    // get_partner_job_availability answers with a status object, never an error.
    expect((await xAdmin.client.rpc("get_partner_job_availability", { p_org: tOrg.id, p_job: jobId })).data).toEqual({ status: "not_found" });
    expect((await xAdmin.client.rpc("get_partner_job_availability", { p_org: xOrg.id, p_job: jobId })).data).toEqual({ status: "not_found" });
  });

  it("the reported org can't use the reporter-side RPCs on its own case, and the reporter org can't read the org-side case", async () => {
    expect(err(await tAdmin.client.rpc("get_conduct_report", { p_org: tOrg.id, p_case: caseId }))).toBe("not_found");
    expect(err(await tAdmin.client.rpc("reply_conduct_info_request", { p_org: tOrg.id, p_case: caseId, p_body: "Replying on the reporter's thread.", p_file_ids: [] }))).toBe("not_found");
    expect(err(await sAdmin.client.rpc("get_conduct_case_for_org", { p_org: sOrg.id, p_case: caseId }))).toBe("not_found");
    expect(err(await sAdmin.client.rpc("submit_conduct_response", { p_org: sOrg.id, p_notice: noticeId, p_body: "Answering a notice sent to the other org.", p_file_ids: [] }))).toBe("not_found");
  });

  it("deactivate_member_in_settlement refuses another org's membership id, even for a settling org admin", async () => {
    const o = await createUser("qa10-settle-idor");
    const org = await createOrg(o, "QA Settle IDOR");
    const victimMembership = sql(`select id::text from public.organization_memberships where organization_id = '${xOrg.id}' and user_id = '${xAdmin.id}'`)[0];
    sql(`update public.organizations set suspended_at = now() where id = '${org.id}'`);
    try {
      expect(err(await o.client.rpc("deactivate_member_in_settlement", { p_org: org.id, p_membership: victimMembership }))).toBe("not_found");
      expect(sql(`select status from public.organization_memberships where id = '${victimMembership}'`)).toEqual(["active"]);
      // An active (non-settling) org admin can't use it either.
      const tRecMembership = sql(`select id::text from public.organization_memberships where organization_id = '${tOrg.id}' and user_id = '${tRec.id}'`)[0];
      expect(err(await tAdmin.client.rpc("deactivate_member_in_settlement", { p_org: tOrg.id, p_membership: tRecMembership }))).toBe("not_found");
    } finally {
      sql(`update public.organizations set suspended_at = null where id = '${org.id}'`);
    }
  });

  it("a match id from another org can't be used for a job report context", async () => {
    const someMatch = sql(`select coalesce((select id::text from public.matches where candidate_org_id <> '${xOrg.id}' limit 1), '')`)[0];
    if (someMatch) expect(err(await xAdmin.client.rpc("get_conduct_report_context", { p_org: xOrg.id, p_match: someMatch }))).toBe("not_found");
    expect(err(await xAdmin.client.rpc("get_conduct_report_context", { p_org: xOrg.id, p_match: randomUUID() }))).toBe("not_found");
    // Both ids, or neither: not_found (never a hint which one exists).
    expect(err(await sRec.client.rpc("get_conduct_report_context", { p_org: sOrg.id, p_referral: referralId, p_match: randomUUID() }))).toBe("not_found");
    expect(err(await sRec.client.rpc("get_conduct_report_context", { p_org: sOrg.id }))).toBe("not_found");
  });
});

// ---------------------------------------------------------------------------------------------
describe("reporter identity never reaches the reported org (BR-43, AC-69, AC-113, N10-D28)", () => {
  it("nothing the reported org can read names the reporting user, the reporting org, the category or the text", async () => {
    // Respond, then decide (warning), so every org-side surface is populated.
    expect(err(await tAdmin.client.rpc("reply_conduct_followup", { p_org: tOrg.id, p_followup: followupId, p_body: "Our recruiter Jane handled the candidate.", p_file_ids: [] }))).toBe("ok");
    expect(err(await tAdmin.client.rpc("submit_conduct_response", { p_org: tOrg.id, p_notice: noticeId, p_body: "We did not share the CV with anyone outside.", p_file_ids: [] }))).toBe("ok");
    expect(err(await decide(pa, caseId, noticeId, "breach", "warning"))).toBe("ok");

    const surfaces: unknown[] = [];
    surfaces.push((await tAdmin.client.rpc("get_conduct_case_for_org", { p_org: tOrg.id, p_case: caseId })).data);
    surfaces.push((await tAdmin.client.rpc("get_network_standing", { p_org: tOrg.id })).data);
    surfaces.push((await tAdmin.client.rpc("get_my_org_state", { p_org: tOrg.id })).data);
    for (const u of [tAdmin, tRec]) {
      surfaces.push((await u.client.from("notifications").select("*").eq("user_id", u.id)).data);
      // Audit rows about the case (the referral's own `referral.received` row legitimately names its submitter).
      surfaces.push((await u.client.from("audit_events").select("action, entity_type, entity_id, metadata").eq("organization_id", tOrg.id).eq("entity_id", caseId)).data);
      surfaces.push((await u.client.from("disputes").select("*")).data);
    }
    const blob = JSON.stringify(surfaces);
    for (const leak of [sRec.id, sRec.email, "qa10-s-rec", sOrg.id, S_NAME, REPORT_TEXT, "shared_outside", pa.id, pb.id, "qa10-pa"]) {
      expect.soft(blob, `leak: ${leak}`).not.toContain(leak);
    }
  });

  // QA-N10-03 (MINOR, backend): conduct / sanction audit rows on the reported org carry the platform
  // admin's user id in actor_id, readable by the org's org_admins through PostgREST (AC-148, N10-D28:
  // no platform admin name or id on any member-facing surface). The audit page shows "System" (the
  // profile isn't readable), but the id lets the org tell admins apart across cases.
  it.fails("QA-N10-03: the reported org's audit rows don't expose the platform admin's id", async () => {
    const rows = (await tAdmin.client.from("audit_events").select("actor_id, action").eq("organization_id", tOrg.id).eq("entity_id", caseId)).data ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.actor_id === pa.id)).toEqual([]);
  });

  it("naming the reporter names the org only, never the user", async () => {
    const r = (await referralBetween(sRec, sOrg.id, tAdmin, tOrg.id)).referralId;
    const c = ((await fileReport(sAdmin, sOrg.id, { p_referral: r })).data as { case_id: string }).case_id;
    expect(err(await pa.client.rpc("admin_set_conduct_category", { p_case: c, p_category: "went_around" }))).toBe("ok");
    const v = currentVersion();
    expect(err(await pa.client.rpc("admin_send_conduct_notice", {
      p_case: c, p_language: "en", p_conduct_date: today(), p_rules_version: v.id, p_rules_cited: ["2.3"],
      p_allegation: "Contacted the candidate directly to go around the referral.", p_alleged_when: "This month",
      p_evidence_summary: "The candidate confirmed the direct contact in writing.", p_name_reporter: true,
    }))).toBe("ok");
    const view = (await tAdmin.client.rpc("get_conduct_case_for_org", { p_org: tOrg.id, p_case: c })).data as { notices: { reporter_org_name: string | null }[] };
    expect(view.notices[0].reporter_org_name).toBe(S_NAME);
    expect(JSON.stringify(view)).not.toMatch(new RegExp(`${sAdmin.id}|qa10-s-admin|${sAdmin.email}|${REPORT_TEXT.slice(0, 20)}`));
  });

  it("recruiters of the reporting org never see the case in the audit log (AC-149)", async () => {
    const rows = (await sRec.client.from("audit_events").select("action, entity_id").eq("organization_id", sOrg.id)).data ?? [];
    expect(rows.filter((x) => x.entity_id === caseId)).toEqual([]);
    const adm = (await sAdmin.client.from("audit_events").select("action, metadata").eq("organization_id", sOrg.id).eq("entity_id", caseId)).data ?? [];
    expect(adm).toEqual([{ action: "conduct_report.filed", metadata: {} }]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("the restriction reason never reaches partners (BR-14, BR-42, AC-49, AC-50)", () => {
  it("S21 status is the same neutral value for a held and a suspended owner, with no reason field", async () => {
    // Held owner.
    const h = await createUser("qa10-held");
    const hOrg = await createOrg(h, "QA Held Owner");
    const hRef = await referralBetween(sRec, sOrg.id, h, hOrg.id);
    // Suspended owner.
    const su = await createUser("qa10-susp");
    const suOrg = await createOrg(su, "QA Susp Owner");
    const suRef = await referralBetween(sRec, sOrg.id, su, suOrg.id);
    await immediateHold(pa, hOrg.id);
    sql(`update public.organizations set suspended_at = now() where id = '${suOrg.id}'`);
    try {
      const held = (await sRec.client.rpc("get_partner_job_availability", { p_org: sOrg.id, p_job: hRef.jobId })).data as Record<string, unknown>;
      const susp = (await sRec.client.rpc("get_partner_job_availability", { p_org: sOrg.id, p_job: suRef.jobId })).data as Record<string, unknown>;
      expect(Object.keys(held).sort()).toEqual(["job_title", "org_name", "status"]);
      expect(Object.keys(susp).sort()).toEqual(["job_title", "org_name", "status"]);
      expect([held.status, susp.status]).toEqual(["not_taking_referrals", "not_taking_referrals"]);
      // Submitting to both returns the hidden-job outcome (no reason).
      expect(await trySubmit(sRec, sOrg.id, hRef.jobId)).toBe("job_not_open_for_referrals");
      expect(await trySubmit(sRec, sOrg.id, suRef.jobId)).toBe("job_not_open_for_referrals");
    } finally {
      liftAll(hOrg.id);
      sql(`update public.organizations set suspended_at = null where id = '${suOrg.id}'`);
    }
  });

  // QA-N10-01 (MAJOR, backend): organizations_select_partners lets any partner org select the
  // sanction columns (suspended_at, terminated_at, suspended_reason) of the other org through PostgREST.
  it.fails("QA-N10-01: a partner can't read the other org's suspension / termination columns", async () => {
    const su = await createUser("qa10-susp-cols");
    const suOrg = await createOrg(su, "QA Susp Columns");
    await referralBetween(sRec, sOrg.id, su, suOrg.id);
    sql(`update public.organizations set suspended_at = now(), terminated_at = now(), suspended_reason = 'QA internal reason' where id = '${suOrg.id}'`);
    try {
      const r = await sRec.client.from("organizations").select("suspended_at, terminated_at, suspended_reason").eq("id", suOrg.id);
      // Expected: refused, or no row, or the columns not readable. Actual: the row with both dates and the reason.
      const row = r.data?.[0] as { suspended_at: string | null; terminated_at: string | null; suspended_reason: string | null } | undefined;
      expect(r.error !== null || !row || (row.suspended_at === null && row.terminated_at === null && row.suspended_reason === null)).toBe(true);
    } finally {
      sql(`update public.organizations set suspended_at = null, terminated_at = null, suspended_reason = null where id = '${suOrg.id}'`);
    }
  });

  it("a partner can't read the owner's org state, standing or acceptances", async () => {
    expect(err(await sRec.client.rpc("get_my_org_state", { p_org: tOrg.id }))).toBe("not_found");
    expect(err(await sAdmin.client.rpc("get_network_standing", { p_org: tOrg.id }))).toBe("not_found");
    expect((await sAdmin.client.from("network_rules_org_acceptances").select("id").eq("organization_id", tOrg.id)).data).toEqual([]);
    expect((await sAdmin.client.from("network_rules_member_acceptances").select("id").eq("user_id", tAdmin.id)).data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("settlement mode exposes only in-scope referrals (BR-34, BR-36, N10-D31)", () => {
  it("a closed referral and its messages / events are invisible and can't be written to; new submissions are refused", async () => {
    const o = await createUser("qa10-settle");
    const org = await createOrg(o, "QA Settling");
    const liveRef = await referralBetween(sRec, sOrg.id, o, org.id);
    const live = liveRef.referralId;
    const closed = (await referralBetween(sRec, sOrg.id, o, org.id)).referralId;
    expect(err(await sRec.client.from("referral_messages").insert({ referral_id: closed, author_id: sRec.id, author_side: "source", body: "Before closing." }))).toBe("ok");
    expect(err(await sRec.client.rpc("withdraw_referral", { p_referral: closed, p_reason: "Candidate took another offer.", p_expected_version: await version(closed), p_release: false, p_acting_org: sOrg.id }))).toBe("ok");
    const ownJob = await createJob(o, org.id);
    sql(`update public.organizations set suspended_at = now() where id = '${org.id}'`);
    try {
      const ids = ((await o.client.from("referrals").select("id")).data ?? []).map((x) => x.id);
      expect(ids).toContain(live);
      expect(ids).not.toContain(closed);
      expect((await o.client.from("referral_messages").select("id").eq("referral_id", closed)).data).toEqual([]);
      expect((await o.client.from("referral_status_events").select("id").eq("referral_id", closed)).data).toEqual([]);
      expect(err(await o.client.from("referral_messages").insert({ referral_id: closed, author_id: o.id, author_side: "target", body: "Writing on closed history." }))).not.toBe("ok");
      expect(err(await o.client.from("referral_messages").insert({ referral_id: live, author_id: o.id, author_side: "target", body: "Still settling this one." }))).toBe("ok");
      // Candidates behind the live referral stay closed (only the shared snapshot is readable).
      expect((await o.client.from("candidates").select("id").eq("id", liveRef.candidateId)).data).toEqual([]);
      // Jobs: own job with no in-scope referral is not readable; no write either.
      expect((await o.client.from("jobs").select("id").eq("id", ownJob)).data).toEqual([]);
      expect(err(await o.client.from("jobs").update({ title: "Edited in settlement" }).eq("id", ownJob))).toBe("ok"); // RLS: 0 rows
      expect(sql(`select title <> 'Edited in settlement' from public.jobs where id = '${ownJob}'`)).toEqual(["t"]);
      // The settling org can't start a referral to a partner job.
      const pj = await createJob(xAdmin, xOrg.id);
      expect(await trySubmit(o, org.id, pj).catch((e: Error) => e.message)).not.toBe("ok");
    } finally {
      sql(`update public.organizations set suspended_at = null where id = '${org.id}'`);
    }
  });

  it("a settling org can't change its own suspension / termination columns or org settings", async () => {
    const o = await createUser("qa10-settle-cols");
    const org = await createOrg(o, "QA Settle Cols");
    sql(`update public.organizations set suspended_at = now() where id = '${org.id}'`);
    try {
      const r = await o.client.from("organizations").update({ suspended_at: null } as never).eq("id", org.id);
      expect(r.error).not.toBeNull();
      expect(err(await o.client.from("organizations").update({ name: "Renamed while suspended" }).eq("id", org.id))).toBe("ok"); // 0 rows
      expect(sql(`select name || '|' || (suspended_at is not null)::text from public.organizations where id = '${org.id}'`)).toEqual(["QA Settle Cols|true"]);
    } finally {
      sql(`update public.organizations set suspended_at = null where id = '${org.id}'`);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("sanction ladder: no bypass (BR-27 to BR-31)", () => {
  it("members can't call any admin conduct / sanction RPC", async () => {
    const v = currentVersion();
    const calls: [string, Record<string, unknown>][] = [
      ["admin_list_conduct_cases", {}],
      ["admin_get_conduct_case", { p_case: caseId }],
      ["admin_decide_conduct_case", { p_case: caseId, p_notice: noticeId, p_outcome: "no_breach", p_finding: null, p_rules_cited: [], p_residual: false, p_level: null, p_why_not_hold: null, p_planned_review_on: null }],
      ["admin_apply_immediate_hold", { p_case: caseId, p_ground: "2.3", p_language: "en", p_conduct_date: today(), p_rules_version: v.id, p_rules_cited: [], p_allegation: "x".repeat(25), p_alleged_when: "now", p_evidence_summary: "y".repeat(25), p_name_reporter: false }],
      ["admin_lift_sanction", { p_org: tOrg.id, p_sanction: null, p_reason: "Self-lift attempt." }],
      ["admin_org_conduct_file", { p_org: tOrg.id }],
      ["admin_open_conduct_case", { p_org: sOrg.id, p_category: "other", p_admin_source: "other", p_referral: null, p_description: "Retaliation case opened by a member.", p_file_ids: [] }],
      ["admin_close_stale_referral", { p_referral: referralId, p_reason: "Closing as a member." }],
      ["publish_network_rules_version", { p_label: "9.999", p_type: "non_material", p_effective_on: today(), p_texts: {}, p_summaries: {}, p_legal_reason: null, p_approval_reference: "member" }],
    ];
    for (const u of [tAdmin, sAdmin]) {
      for (const [fn, args] of calls) {
        const m = err(await u.client.rpc(fn as never, args as never));
        expect.soft(["forbidden", "not_found"], `${fn}: ${m}`).toContain(m);
      }
    }
  });

  it("a sanction can't be lifted through another org's id, a warning can't be 'lifted', and a case is decided once", async () => {
    const o = await createUser("qa10-ladder");
    const org = await createOrg(o, "QA Ladder");
    const { caseId: c, sanction_id: s, notice_id: n } = await immediateHold(pa, org.id);
    try {
      expect(err(await pa.client.rpc("admin_lift_sanction", { p_org: xOrg.id, p_sanction: s, p_reason: "Wrong org id on purpose." }))).toBe("not_found");
      expect(((await o.client.rpc("get_my_org_state", { p_org: org.id })).data as { restriction: string }).restriction).toBe("network_hold");
      // Deciding on a notice of another case is refused.
      expect(err(await decide(pa, c, noticeId, "breach", "warning", { p_rules_cited: ["2.3"] }))).toBe("sanction_notice_required");
      closeWindow(n);
      expect(err(await decide(pa, c, n, "breach", "warning", { p_rules_cited: ["2.3"] }))).toBe("ok"); // lift hold + warning
      expect(err(await decide(pa, c, n, "breach", "termination", { p_rules_cited: ["2.3"], p_why_not_hold: "Trying to decide the same case twice." }))).not.toBe("ok");
      const w = sql(`select id::text from app.org_sanctions where case_id = '${c}' and level = 'warning'`)[0];
      expect(err(await pa.client.rpc("admin_lift_sanction", { p_org: org.id, p_sanction: w, p_reason: "Warnings aren't lifted." }))).toBe("invalid_transition");
      // Whitespace / case variants of a valid ground are refused.
      const c2 = await adminCase(pa, org.id);
      const v = currentVersion();
      for (const g of ["2.3 ", " 4.8", "4.80", "2,3"]) {
        expect(err(await pa.client.rpc("admin_apply_immediate_hold", {
          p_case: c2, p_ground: g, p_language: "en", p_conduct_date: today(), p_rules_version: v.id, p_rules_cited: [],
          p_allegation: "Forged candidate confirmations again.", p_alleged_when: "This week", p_evidence_summary: "Same IP address on all confirmations.", p_name_reporter: false,
        }))).toBe("immediate_hold_ground_invalid");
      }
      expect(sql(`select count(*) from app.org_sanctions where case_id = '${c2}'`)).toEqual(["0"]);
    } finally {
      liftAll(org.id);
    }
  });

  it("termination without 'why not a hold' is refused; review requests close after the stored deadline", async () => {
    const o = await createUser("qa10-term");
    const org = await createOrg(o, "QA Term");
    const c = await adminCase(pa, org.id);
    const n = await sendNotice(pa, c, ["2.3"]);
    closeWindow(n);
    expect(err(await decide(pa, c, n, "breach", "termination"))).toBe("sanction_reason_required");
    expect(err(await decide(pa, c, n, "breach", "network_hold"))).toBe("ok");
    sql(`update app.conduct_decisions set review_request_due_at = now() - interval '1 minute' where case_id = '${c}'`);
    expect(err(await o.client.rpc("request_sanction_review", { p_org: org.id, p_case: c, p_text: "Too late, but asking anyway.", p_file_ids: [] }))).toBe("review_window_closed");
    liftAll(org.id);
  });
});

// ---------------------------------------------------------------------------------------------
describe("input validation in the database (BR-16, BR-22, spec §5.16)", () => {
  it("report text, category, date, files and attestation are checked server-side", async () => {
    const u = await createUser("qa10-validate");
    const uo = await createOrg(u, "QA Validate");
    const ref = (await referralBetween(u, uo.id, tAdmin, tOrg.id)).referralId;
    const bad: [Record<string, unknown>, string][] = [
      [{ p_description: "x".repeat(19) }, "conduct_text_invalid"],
      [{ p_description: "x".repeat(4001) }, "conduct_text_invalid"],
      [{ p_description: " ".repeat(30) }, "conduct_text_invalid"],
      [{ p_category: "bogus" }, "conduct_category_invalid"],
      [{ p_category: "" }, "conduct_category_invalid"],
      [{ p_occurred_on: "2099-01-01" }, "conduct_date_future"],
      [{ p_attested: false }, "conduct_attestation_required"],
      [{ p_file_ids: Array.from({ length: 6 }, () => randomUUID()) }, "conduct_too_many_files"],
      [{ p_file_ids: [randomUUID()] }, "conduct_file_invalid"],
    ];
    for (const [over, code] of bad) expect.soft(err(await fileReport(u, uo.id, { p_referral: ref, ...over })), JSON.stringify(over).slice(0, 80)).toBe(code);
    expect(sql(`select count(*) from app.conduct_cases where reporter_user_id = '${u.id}'`)).toEqual(["0"]);
    // 20 and 4,000 characters are accepted; a hiring-side category from the sourcing side is accepted (AC-126).
    expect(err(await fileReport(u, uo.id, { p_referral: ref, p_description: "x".repeat(4000), p_category: "job_terms" }))).toBe("ok");
  });

  it("acceptance and response inputs are checked", async () => {
    const v = currentVersion();
    expect(err(await tRec.client.rpc("accept_network_rules", { p_org: tOrg.id, p_version: v.id, p_locale: "de", p_personal: true, p_for_org: false }))).toBe("invalid_locale");
    expect(err(await tRec.client.rpc("accept_network_rules", { p_org: tOrg.id, p_version: v.id, p_locale: "en", p_personal: false, p_for_org: false }))).toBe("rules_acceptance_required");
    expect(err(await tRec.client.rpc("accept_network_rules", { p_org: tOrg.id, p_version: v.id, p_locale: "en", p_personal: true, p_for_org: true }))).toBe("forbidden");
    expect(err(await tRec.client.rpc("accept_network_rules", { p_org: tOrg.id, p_version: randomUUID(), p_locale: "en", p_personal: true, p_for_org: false }))).toBe("rules_acceptance_required");
    const c = await adminCase(pa, xOrg.id);
    const n = await sendNotice(pa, c, ["2.3"]);
    expect(err(await xAdmin.client.rpc("submit_conduct_response", { p_org: xOrg.id, p_notice: n, p_body: "x".repeat(19), p_file_ids: [] }))).toBe("conduct_text_invalid");
    expect(err(await xAdmin.client.rpc("submit_conduct_response", { p_org: xOrg.id, p_notice: n, p_body: "x".repeat(8001), p_file_ids: [] }))).toBe("conduct_text_invalid");
    expect(err(await xAdmin.client.rpc("submit_conduct_response", { p_org: xOrg.id, p_notice: n, p_body: "x".repeat(8000), p_file_ids: [] }))).toBe("ok");
  });
});

// ---------------------------------------------------------------------------------------------
describe("storage policies on conduct-evidence (BR-16, BR-43)", () => {
  const bucket = () => "conduct-evidence";
  const up = (u: TestUser, path: string, type = "application/pdf", body: Uint8Array = pdf(), upsert = false) =>
    u.client.storage.from(bucket()).upload(path, body, { contentType: type, upsert });

  it("only the member's own path in an org they belong to; admin/ paths only for that platform admin; strict file names", async () => {
    const id = () => randomUUID();
    const refused = [
      [sRec, `${tOrg.id}/${sRec.id}/${id()}.pdf`], // not a member of T
      [sRec, `${sOrg.id}/${sAdmin.id}/${id()}.pdf`], // someone else's user folder
      [sRec, `admin/${sRec.id}/${id()}.pdf`], // admin folder, not an admin
      [pa, `admin/${pb.id}/${id()}.pdf`], // another admin's folder
      [sRec, `${sOrg.id}/${sRec.id}/${id()}.html`],
      [sRec, `${sOrg.id}/${sRec.id}/${id()}.PDF`],
      [sRec, `${sOrg.id}/${sRec.id}/x/${id()}.pdf`],
      [sRec, `${sOrg.id}/${sRec.id}/../${id()}.pdf`],
    ] as const;
    for (const [u, p] of refused) expect.soft((await up(u, p)).error, p).not.toBeNull();
    expect((await up(pa, `admin/${pa.id}/${id()}.pdf`)).error).toBeNull();
    // An HTML body declared as text/html is refused by the bucket's MIME list.
    expect((await up(sRec, `${sOrg.id}/${sRec.id}/${id()}.pdf`, "text/html", new TextEncoder().encode("<script>alert(1)</script>"))).error).not.toBeNull();
    // A former member can't upload.
    const gone = await createUser("qa10-gone");
    await addMember(sOrg.id, gone, "recruiter");
    sql(`update public.organization_memberships set status = 'suspended' where organization_id = '${sOrg.id}' and user_id = '${gone.id}'`);
    expect((await up(gone, `${sOrg.id}/${gone.id}/${id()}.pdf`)).error).not.toBeNull();
  });

  it("an uploader can't read, sign, list, overwrite or delete objects; registration checks owner and MIME", async () => {
    const path = `${sOrg.id}/${sRec.id}/${randomUUID()}.pdf`;
    expect((await up(sRec, path)).error).toBeNull();
    const s = sRec.client.storage.from(bucket());
    expect((await s.download(path)).error).not.toBeNull();
    expect((await s.createSignedUrl(path, 60)).error).not.toBeNull();
    expect(((await s.list(`${sOrg.id}/${sRec.id}`)).data ?? []).length).toBe(0);
    expect((await up(sRec, path, "application/pdf", pdf(), true)).error).not.toBeNull(); // upsert = overwrite
    await s.remove([path]);
    expect(sql(`select count(*) from storage.objects where bucket_id = 'conduct-evidence' and name = '${path}'`)).toEqual(["1"]);
    // The org admin can't register a colleague's object.
    expect(err(await sAdmin.client.rpc("register_conduct_evidence", { p_storage_path: path, p_file_name: "x.pdf" }))).toBe("conduct_file_invalid");
    // A PNG declared under a .pdf name is refused at registration.
    const png = `${sOrg.id}/${sRec.id}/${randomUUID()}.pdf`;
    expect((await up(sRec, png, "image/png")).error).toBeNull();
    expect(err(await sRec.client.rpc("register_conduct_evidence", { p_storage_path: png, p_file_name: "x.pdf" }))).toBe("conduct_file_invalid");
    // The file name is sanitized (no markup reaches the admin screens).
    const reg = await sRec.client.rpc("register_conduct_evidence", { p_storage_path: path, p_file_name: `<img src=x onerror=alert(1)>.pdf` });
    expect(reg.error).toBeNull();
    expect((reg.data as { file_name: string }).file_name).not.toMatch(/[<>]/);
    // Registering the same object twice is refused.
    expect(err(await sRec.client.rpc("register_conduct_evidence", { p_storage_path: path, p_file_name: "again.pdf" }))).toBe("conduct_file_invalid");
  });

  it("a draft uploaded under one org can't be attached to a report filed as another org", async () => {
    const both = await createUser("qa10-two-orgs");
    const a = await createOrg(both, "QA Two Orgs A");
    const b = await createOrg(both, "QA Two Orgs B");
    const path = `${a.id}/${both.id}/${randomUUID()}.pdf`;
    expect((await up(both, path)).error).toBeNull();
    const reg = await both.client.rpc("register_conduct_evidence", { p_storage_path: path, p_file_name: "proof.pdf" });
    const fileId = (reg.data as { id: string }).id;
    sql(`update app.conduct_files set scan_status = 'clean', sha256 = repeat('a', 64) where id = '${fileId}'`);
    const ref = (await referralBetween(both, b.id, tAdmin, tOrg.id)).referralId;
    expect(err(await both.client.rpc("file_conduct_report", {
      p_org: b.id, p_referral: ref, p_match: null as unknown as string, p_category: "other", p_description: REPORT_TEXT,
      p_occurred_on: null as unknown as string, p_occurred_approx: false, p_attested: true, p_file_ids: [fileId],
    } as never))).toBe("conduct_file_invalid");
    // Another user's draft id can't be attached either.
    expect(err(await fileReport(sAdmin, sOrg.id, { p_referral: (await referralBetween(sAdmin, sOrg.id, tAdmin, tOrg.id)).referralId, p_file_ids: [fileId] }))).toBe("conduct_file_invalid");
    // Nor removed by someone else.
    expect(err(await sAdmin.client.rpc("remove_conduct_draft_file", { p_file: fileId }))).toBe("not_found");
    expect(((await sAdmin.client.rpc("list_conduct_draft_files", { p_ids: [fileId] })).data as unknown[]).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe("first-access gate holes (BR-7, AC-19, AC-143)", () => {
  let gated: TestUser;
  beforeAll(async () => {
    gated = await createUser("qa10-gated", { acceptRules: false });
    await addMember(tOrg.id, gated, "org_admin");
  });

  it("N10 writing RPCs refuse a gated member (report, response, review, info reply, evidence)", async () => {
    const ref = (await referralBetween(sRec, sOrg.id, tAdmin, tOrg.id)).referralId;
    expect(err(await gated.client.rpc("file_conduct_report", {
      p_org: tOrg.id, p_referral: ref, p_match: null as unknown as string, p_category: "other", p_description: REPORT_TEXT,
      p_occurred_on: null as unknown as string, p_occurred_approx: false, p_attested: true, p_file_ids: [],
    } as never))).toBe("rules_acceptance_required");
    const c = await adminCase(pa, tOrg.id);
    const n = await sendNotice(pa, c, ["2.3"]);
    expect(err(await gated.client.rpc("submit_conduct_response", { p_org: tOrg.id, p_notice: n, p_body: "Gated admin answering the notice.", p_file_ids: [] }))).toBe("rules_acceptance_required");
    expect(sql(`select count(*) from app.conduct_responses where notice_id = '${n}'`)).toEqual(["0"]);
    expect((await gated.client.storage.from("conduct-evidence").upload(`${tOrg.id}/${gated.id}/${randomUUID()}.pdf`, pdf(), { contentType: "application/pdf" })).error).not.toBeNull();
  });

  // QA-N10-02 (MINOR, backend): candidate_photos_delete has no app.assert_rules_gate(), so a gated
  // member deletes candidate photos through the Storage API (AC-143: any authenticated write).
  it.fails("QA-N10-02: a gated member can't delete a candidate photo through Storage", async () => {
    const cand = await createCandidate(tAdmin, tOrg.id);
    const path = `${tOrg.id}/${cand}/photo-${randomUUID().slice(0, 6)}.png`;
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect((await tAdmin.client.storage.from("candidate-photos").upload(path, png, { contentType: "image/png" })).error).toBeNull();
    await gated.client.storage.from("candidate-photos").remove([path]);
    expect(sql(`select count(*) from storage.objects where bucket_id = 'candidate-photos' and name = '${path}'`)).toEqual(["1"]);
  });

  it("accept_network_rules stays exempt and afterwards the same write works", async () => {
    const v = currentVersion();
    expect(err(await gated.client.rpc("accept_network_rules", { p_org: tOrg.id, p_version: v.id, p_locale: "fr-CA", p_personal: true, p_for_org: false }))).toBe("ok");
    expect(sql(`select locale || '|' || (sha256 = (select sha256 from public.network_rules_version_texts where version_id = '${v.id}' and locale = 'fr-CA'))::text
                from public.network_rules_member_acceptances where user_id = '${gated.id}'`)).toEqual(["fr-CA|true"]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("BR-19 / AC-62: a conduct case changes no other dispute rule (before / after)", () => {
  it("release, claim blocker and prior-presentation eligibility are identical before and after a report, a notice and a hold", async () => {
    const h = await createUser("qa10-br19-h");
    const hOrg = await createOrg(h, "QA BR19 Hiring");
    const ref = (await referralBetween(sAdmin, sOrg.id, h, hOrg.id)).referralId;
    const snap = () => sql(`select app.release_allowed('${ref}')::text || '|' || coalesce(app.claim_blocker('${ref}'), 'none')
                             || '|' || (select count(*) from public.disputes where referral_id = '${ref}' and status = 'open')`)[0];
    const before = snap();
    const c = ((await fileReport(sAdmin, sOrg.id, { p_referral: ref })).data as { case_id: string }).case_id;
    expect(snap()).toBe(before);
    expect(err(await pa.client.rpc("admin_set_conduct_category", { p_case: c, p_category: "shared_outside" }))).toBe("ok");
    await sendNotice(pa, c, ["2.3"]);
    expect(snap()).toBe(before);
    // The hiring side's view of the same referral is unchanged too.
    const h2 = sql(`select app.release_allowed('${ref}')::text`)[0];
    expect(h2).toBe(before.split("|")[0]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("gate after a non-material version (frontend gap 14, AC-20, BR-7)", () => {
  // QA-N10-05 (MAJOR, backend): once a non-material version is current, a never-accepted org_admin of
  // an org that accepted the required version is shown the personal statement only (get_my_org_state:
  // org_accepted_current is set, so the UI follows AC-20), but accept_network_rules(personal only)
  // refuses with rules_acceptance_required because the org hasn't accepted *that* version. The admin
  // can't pass the gate. Reproduced in one rolled-back transaction (nothing becomes visible to other
  // sessions; no publish notification is sent).
  it.fails("QA-N10-05: a new org_admin can pass the gate with the personal statement the UI offers", async () => {
    const owner = await createUser("qa10-nm-owner");
    const org = await createOrg(owner, "QA Non Material");
    const newcomer = await createUser("qa10-nm-admin", { acceptRules: false });
    await addMember(org.id, newcomer, "org_admin");
    const v1 = currentVersion().id;
    const out = sql(`
      begin;
      with v as (
        insert into public.network_rules_versions (label, type, status, effective_on, effective_at, approval_reference, rule_numbers)
        select '9.990', 'non_material', 'draft', app.today_et(), now() - interval '1 second', 'QA rollback only', rule_numbers
          from public.network_rules_versions where id = '${v1}' returning id)
      insert into public.network_rules_version_texts (version_id, locale, body, change_summary)
      select v.id, t.locale, t.body || E'\n', 'Typo fixes only, no change in meaning.' from v, public.network_rules_version_texts t where t.version_id = '${v1}';
      update public.network_rules_versions set status = 'published', published_at = now() where label = '9.990';
      create temp table qa_out (step text, val text) on commit drop;
      grant all on qa_out to authenticated;
      set local role authenticated;
      select set_config('request.jwt.claims', json_build_object('sub', '${newcomer.id}', 'role', 'authenticated')::text, true);
      do $$
      declare s jsonb; v uuid := (select id from public.network_rules_versions where label = '9.990');
      begin
        s := public.get_my_org_state('${org.id}');
        insert into qa_out values ('ui_org_accepted', (s->'rules'->'org_accepted_current'->>'at' is not null)::text),
                                  ('gate_required', (s->'rules'->>'gate_required'));
        begin
          perform public.accept_network_rules('${org.id}', v, 'en', true, false);
          insert into qa_out values ('accept', 'ok');
        exception when others then insert into qa_out values ('accept', sqlerrm);
        end;
      end $$;
      select string_agg(step || '=' || val, ';' order by step) from qa_out;`); // last statement: psql prints it; no COMMIT, so the session's transaction is rolled back on exit
    expect(sql(`select count(*) from public.network_rules_versions where label = '9.990'`)).toEqual(["0"]);
    // The UI state says "org already accepted" and the member is gated...
    const res = out.join(";");
    expect(res).toContain("ui_org_accepted=true");
    expect(res).toContain("gate_required=true");
    // ...so the gate offers the personal statement only, which the RPC must then accept.
    expect(res).toContain("accept=ok");
  });
});

// ---------------------------------------------------------------------------------------------
describe("org rate limit (BR-25, AC-63)", () => {
  it("the 11th report from one org in 24 h is refused with report_rate_limited_org, nothing created", async () => {
    const a = await createUser("qa10-rl-a");
    const org = await createOrg(a, "QA Rate Limit Org");
    const b = await createUser("qa10-rl-b");
    const c = await createUser("qa10-rl-c");
    await addMember(org.id, b, "recruiter");
    await addMember(org.id, c, "recruiter");
    const plan = [a, a, a, a, b, b, b, b, c, c];
    for (const u of plan) {
      const ref = (await referralBetween(u, org.id, tAdmin, tOrg.id)).referralId;
      expect(err(await fileReport(u, org.id, { p_referral: ref }))).toBe("ok");
    }
    const ref = (await referralBetween(c, org.id, tAdmin, tOrg.id)).referralId;
    expect(err(await fileReport(c, org.id, { p_referral: ref }))).toBe("report_rate_limited_org");
    expect(sql(`select count(*) from app.conduct_cases where reporter_org_id = '${org.id}'`)).toEqual(["10"]);
  });
});
