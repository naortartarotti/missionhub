import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, createCandidate, createJob, createOrg, createUser, drainQueue, sql, type TestUser } from "./helpers";
import { scanConductEvidence } from "@/server/queue/handlers/conduct-evidence";
import {
  addMember, adminCase, closeWindow, currentVersion, decide, err, liftAll, referralBetween, sendNotice, today, transition,
} from "./n10-helpers";

/**
 * N10 conduct reports and the sanction ladder: BR-15 to BR-32, BR-40, BR-43, EC-3, EC-5, EC-6,
 * AC-52 to AC-97, AC-112, AC-113, AC-126 to AC-134, AC-141, AC-142, AC-145 to AC-150, scenarios 15–30, 35–39.
 */

let pa: TestUser; // platform admin A (decider)
let pb: TestUser; // platform admin B (reviewer)
let src: TestUser; // sourcing org admin (reporter)
let srcRec: TestUser; // sourcing recruiter colleague
let tgt: TestUser; // hiring org admin (reported)
let tgtMgr: TestUser; // hiring org recruiter_manager
let outsider: TestUser;
let sOrg: { id: string };
let tOrg: { id: string };
let xOrg: { id: string };
let referralId: string;
let caseId: string;

const report = (u: TestUser, org: string, over: Record<string, unknown> = {}) =>
  u.client.rpc("file_conduct_report", {
    p_org: org, p_referral: referralId, p_match: null as unknown as string, p_category: "shared_outside",
    p_description: "They sent my candidate's profile to another agency.", p_occurred_on: today(), p_occurred_approx: false,
    p_attested: true, p_file_ids: [], ...over,
  } as never);

const pdf = () => new TextEncoder().encode(`%PDF-1.4\n% conduct ${randomUUID()}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);

beforeAll(async () => {
  pa = await createUser("cond-pa", { platformAdmin: true });
  pb = await createUser("cond-pb", { platformAdmin: true });
  src = await createUser("cond-src");
  tgt = await createUser("cond-tgt");
  outsider = await createUser("cond-out");
  sOrg = await createOrg(src, "Cond Sourcing");
  tOrg = await createOrg(tgt, "Cond Hiring");
  xOrg = await createOrg(outsider, "Cond Outsider");
  srcRec = await createUser("cond-src-rec");
  await addMember(sOrg.id, srcRec, "recruiter");
  tgtMgr = await createUser("cond-tgt-mgr");
  await addMember(tOrg.id, tgtMgr, "recruiter_manager");
  referralId = (await referralBetween(src, sOrg.id, tgt, tOrg.id)).referralId;
});

describe("filing a report (BR-15 to BR-18, BR-25)", () => {
  it("derives the side and categories server-side: 9 sourcing, 7 hiring (AC-126)", async () => {
    const s = (await src.client.rpc("get_conduct_report_context", { p_org: sOrg.id, p_referral: referralId })).data as { side: string; categories: string[]; reported_org_name: string };
    expect([s.side, s.categories.length, s.reported_org_name]).toEqual(["source", 9, "Cond Hiring"]);
    const t = (await tgt.client.rpc("get_conduct_report_context", { p_org: tOrg.id, p_referral: referralId })).data as { side: string; categories: string[] };
    expect([t.side, t.categories]).toEqual(["target", ["went_around", "misused", "shared_outside", "false_info", "discrimination", "retaliation", "other"]]);
  });

  it("forged or unrelated ids are not found; a forged org is not found (AC-54, AC-116)", async () => {
    expect(err(await report(outsider, xOrg.id))).toBe("not_found");
    expect(err(await report(outsider, sOrg.id))).toBe("not_found");
    expect(err(await report(src, sOrg.id, { p_referral: randomUUID() }))).toBe("not_found");
    expect(err(await report(src, sOrg.id, { p_referral: null, p_match: randomUUID() }))).toBe("not_found");
    expect(err(await report(src, sOrg.id, { p_attested: false }))).toBe("conduct_attestation_required");
  });

  it("files from the referral: the reported org is the other side; content lives only in app.conduct_* (AC-53, AC-58, AC-60)", async () => {
    const r = await report(src, sOrg.id, { p_category: "hire_payout" }); // any of the 9 is accepted
    expect(r.error).toBeNull();
    caseId = (r.data as { case_id: string }).case_id;
    expect(sql(`select reported_org_id::text || '|' || reporter_side || '|' || status from app.conduct_cases where id = '${caseId}'`)).toEqual([`${tOrg.id}|source|new`]);
    // First-response target = 2 business days, stored at filing (holidays skipped by the N1 helper).
    expect(sql(`select (first_response_due_at = app.add_business_days(created_at, 2))::text from app.conduct_cases where id = '${caseId}'`)).toEqual(["true"]);
    // No public.disputes row, nothing readable through PostgREST by anyone but the reporter RPCs.
    expect(sql(`select count(*) from public.disputes where referral_id = '${referralId}'`)).toEqual(["0"]);
    for (const u of [src, srcRec, tgt, tgtMgr]) expect((await u.client.schema("app" as never).from("conduct_cases" as never).select("*")).error).not.toBeNull();
    // Reporter notification: received, with the target date, no content.
    expect(sql(`select title from public.notifications where user_id = '${src.id}' and kind = 'conduct_report.received' and link = '/reports/${caseId}'`)).toEqual(["We received your report"]);
  });

  it("audit: the reporter org has only conduct_report.filed (case id); the reported org has nothing before the notice (AC-113)", async () => {
    expect(sql(`select action || '|' || metadata::text from public.audit_events where organization_id = '${sOrg.id}' and entity_id = '${caseId}'`)).toEqual(["conduct_report.filed|{}"]);
    expect(sql(`select count(*) from public.audit_events where organization_id = '${tOrg.id}' and entity_id = '${caseId}'`)).toEqual(["0"]);
  });

  it("a conduct case isn't an open dispute for any other rule (BR-19, AC-62)", async () => {
    // (Before/after snapshot of release and claim eligibility: network-rules-qa.test.ts, QA-N10-07.)
    expect(sql(`select count(*) from public.disputes where status = 'open' and referral_id = '${referralId}'`)).toEqual(["0"]);
    expect(sql(`select coalesce(app.claim_blocker('${referralId}'), 'none')`)[0]).not.toBe("dispute_already_open");
  });

  it("rate limit: the 6th report by a user in 24 h is refused (AC-63)", async () => {
    const u = await createUser("cond-limit");
    const uo = await createOrg(u, "Cond Limit");
    const refs = [];
    for (let i = 0; i < 6; i++) refs.push((await referralBetween(u, uo.id, tgt, tOrg.id)).referralId);
    for (let i = 0; i < 5; i++) expect(err(await report(u, uo.id, { p_referral: refs[i] }))).toBe("ok");
    expect(err(await report(u, uo.id, { p_referral: refs[5] }))).toBe("report_rate_limited_user");
  });

  it("evidence files: draft upload, worker scan + SHA-256, attach, admin-only download (AC-57, AC-61)", async () => {
    const path = `${sOrg.id}/${src.id}/${randomUUID()}.pdf`;
    expect((await src.client.storage.from("conduct-evidence").upload(path, pdf(), { contentType: "application/pdf" })).error).toBeNull();
    // Someone else's path is refused by the storage policy.
    expect((await srcRec.client.storage.from("conduct-evidence").upload(`${sOrg.id}/${src.id}/${randomUUID()}.pdf`, pdf(), { contentType: "application/pdf" })).error).not.toBeNull();
    const reg = await src.client.rpc("register_conduct_evidence", { p_storage_path: path, p_file_name: "proof.pdf" });
    expect(reg.error).toBeNull();
    const fileId = (reg.data as { id: string }).id;
    // Not attachable until clean.
    const ref2 = (await referralBetween(src, sOrg.id, tgt, tOrg.id)).referralId;
    expect(err(await report(src, sOrg.id, { p_referral: ref2, p_file_ids: [fileId] }))).toBe("conduct_files_not_ready");
    await drainQueue();
    // The local stack may be shared with a long-running worker that predates this handler: run the
    // handler directly if the queued scan hasn't landed (same code path the worker uses).
    if (sql(`select scan_status from app.conduct_files where id = '${fileId}'`)[0] === "pending") await scanConductEvidence(admin(), fileId);
    expect(sql(`select scan_status || '|' || (sha256 is not null)::text from app.conduct_files where id = '${fileId}'`)).toEqual(["clean|true"]);
    const filed = await report(src, sOrg.id, { p_referral: ref2, p_file_ids: [fileId] });
    expect(filed.error).toBeNull();
    const fCase = (filed.data as { case_id: string }).case_id;
    // Members can't authorize a download (reporter, colleague, reported org); a platform admin can, audited.
    for (const u of [src, srcRec, tgt]) expect(err(await u.client.rpc("authorize_conduct_evidence", { p_file: fileId }))).toBe("not_found");
    expect((await pa.client.rpc("authorize_conduct_evidence", { p_file: fileId })).data).toBe(path);
    expect(sql(`select count(*) from public.audit_events where action = 'conduct_evidence.accessed' and organization_id is null and entity_id = '${fCase}'`)).toEqual(["1"]);
    // The reporter view lists name and size only.
    const view = (await src.client.rpc("get_conduct_report", { p_org: sOrg.id, p_case: fCase })).data as { files: Record<string, unknown>[] };
    expect(view.files).toEqual([{ file_name: "proof.pdf", size_bytes: pdf().length }]);
  });
});

describe("reporting side readers (BR-15, N10-D23, AC-66, AC-145)", () => {
  it("the reporter and the reporting org's admins read it; a recruiter colleague and other orgs don't", async () => {
    const mine = (await src.client.rpc("get_conduct_report", { p_org: sOrg.id, p_case: caseId })).data as { status: string; is_mine: boolean };
    expect([mine.status, mine.is_mine]).toEqual(["received", true]);
    expect(err(await srcRec.client.rpc("get_conduct_report", { p_org: sOrg.id, p_case: caseId }))).toBe("not_found");
    expect(err(await tgt.client.rpc("get_conduct_report", { p_org: tOrg.id, p_case: caseId }))).toBe("not_found");
    expect(err(await tgt.client.rpc("get_conduct_report", { p_org: sOrg.id, p_case: caseId }))).toBe("not_found");
    // The recruiter colleague's org list returns only their own reports.
    expect((await srcRec.client.rpc("list_my_conduct_reports", { p_org: sOrg.id, p_scope: "org" })).data).toEqual([]);
  });

  it("a recruiter's report is visible to the org admin with the sender's name; after the reporter leaves: 'former member'", async () => {
    const ref = (await referralBetween(srcRec, sOrg.id, tgt, tOrg.id)).referralId;
    const r = await report(srcRec, sOrg.id, { p_referral: ref });
    const c = (r.data as { case_id: string }).case_id;
    const orgList = (await src.client.rpc("list_my_conduct_reports", { p_org: sOrg.id, p_scope: "org" })).data as { id: string; sent_by_name: string | null }[];
    expect(orgList.find((x) => x.id === c)?.sent_by_name).toMatch(/cond-src-rec/);
    const adminView = (await src.client.rpc("get_conduct_report", { p_org: sOrg.id, p_case: c })).data as { can_reply: boolean; is_mine: boolean };
    expect([adminView.is_mine, adminView.can_reply]).toEqual([false, false]);
    sql(`update public.organization_memberships set status = 'suspended' where organization_id = '${sOrg.id}' and user_id = '${srcRec.id}'`);
    try {
      expect(err(await srcRec.client.rpc("get_conduct_report", { p_org: sOrg.id, p_case: c }))).toBe("not_found");
      const after = (await src.client.rpc("get_conduct_report", { p_org: sOrg.id, p_case: c })).data as { sent_by_former: boolean };
      expect(after.sent_by_former).toBe(true);
      // Closing it notifies the org admins with the org title (the reporter left).
      expect(err(await pa.client.rpc("admin_set_conduct_category", { p_case: c, p_category: "other" }))).toBe("ok");
      expect(err(await pa.client.rpc("admin_close_conduct_case", { p_case: c, p_reason_code: "duplicate", p_reason: "Same facts as an earlier report we already handle." }))).toBe("ok");
      expect(sql(`select title from public.notifications where user_id = '${src.id}' and kind = 'conduct_report.closed' and link = '/reports/${c}'`)).toEqual(["A report from your organization is closed"]);
      expect(sql(`select count(*) from public.notifications where user_id = '${srcRec.id}' and kind = 'conduct_report.closed'`)).toEqual(["0"]);
    } finally {
      sql(`update public.organization_memberships set status = 'active' where organization_id = '${sOrg.id}' and user_id = '${srcRec.id}'`);
    }
  });
});

describe("triage, notice, response (BR-20 to BR-22, AC-67 to AC-75, AC-129, AC-133, AC-147)", () => {
  let noticeId: string;

  it("requires the admin category before any first response; members can't call admin RPCs", async () => {
    expect(err(await pa.client.rpc("admin_request_conduct_info", { p_case: caseId, p_question: "Can you share when the profile was sent?" }))).toBe("admin_category_required");
    expect(err(await src.client.rpc("admin_set_conduct_category", { p_case: caseId, p_category: "shared_outside" }))).toBe("forbidden");
    expect(err(await pa.client.rpc("admin_set_conduct_category", { p_case: caseId, p_category: "shared_outside" }))).toBe("ok");
    const card = ((await pa.client.rpc("admin_list_conduct_cases")).data as { id: string; possible_94: boolean; state: string }[]).find((x) => x.id === caseId)!;
    expect([card.possible_94, card.state]).toEqual([true, "new"]);
  });

  it("an info request goes to the reporter only; one reply; the reported org sees nothing (AC-67)", async () => {
    expect(err(await pa.client.rpc("admin_request_conduct_info", { p_case: caseId, p_question: "Can you share when the profile was sent?", p_due_business_days: 3 }))).toBe("ok");
    expect(sql(`select title from public.notifications where user_id = '${src.id}' and kind = 'conduct_report.info_requested'`)).toEqual(["MissionHub has a question about your report"]);
    expect(((await src.client.rpc("get_conduct_report", { p_org: sOrg.id, p_case: caseId })).data as { status: string }).status).toBe("input_needed");
    expect(err(await src.client.rpc("reply_conduct_info_request", { p_org: sOrg.id, p_case: caseId, p_body: "It was sent on November 3 by email.", p_file_ids: [] }))).toBe("ok");
    expect(err(await src.client.rpc("reply_conduct_info_request", { p_org: sOrg.id, p_case: caseId, p_body: "A second reply is refused.", p_file_ids: [] }))).toBe("conduct_reply_closed");
    expect(sql(`select count(*) from public.notifications where kind = 'conduct_report.reply_received' and link = '/admin/disputes/conduct/${caseId}'`)).not.toEqual(["0"]);
    expect(sql(`select count(*) from public.audit_events where organization_id = '${tOrg.id}' and entity_id = '${caseId}'`)).toEqual(["0"]);
    expect(sql(`select count(*) from public.audit_events where organization_id is null and entity_id = '${caseId}' and action in ('conduct.info_requested', 'conduct.reporter_replied', 'conduct.admin_category_set')`)).toEqual(["3"]);
  });

  it("validates the notice's version and rules; stores the outcomes line and a 10-business-day deadline (AC-70, AC-133, AC-147)", async () => {
    const v = currentVersion();
    const base = { p_case: caseId, p_language: "en", p_conduct_date: today(), p_rules_version: v.id, p_rules_cited: ["2.3"],
      p_allegation: "Shared the candidate's profile with an outside agency.", p_alleged_when: "Early November 2026",
      p_evidence_summary: "An email forwarded by the client shows the profile attached.", p_name_reporter: false };
    expect(err(await pa.client.rpc("admin_send_conduct_notice", { ...base, p_rules_cited: ["99.9"] }))).toBe("notice_rule_not_in_version");
    expect(err(await pa.client.rpc("admin_send_conduct_notice", { ...base, p_rules_version: randomUUID() }))).toBe("notice_version_invalid");
    expect(err(await pa.client.rpc("admin_send_conduct_notice", { ...base, p_conduct_date: "2099-01-01" }))).toBe("conduct_date_future");
    expect(err(await pa.client.rpc("admin_send_conduct_notice", { ...base, p_conduct_date: "2000-01-01" }))).toBe("conduct_date_before_rules");
    noticeId = await sendNotice(pa, caseId, ["2.3", "3.4"]);
    expect(sql(`select (response_due_at = app.add_business_days(sent_at, 10))::text || '|' || has_outcomes_line::text || '|' || left(outcomes_line, 40)
                from app.conduct_notices where id = '${noticeId}'`)).toEqual(["true|true|After the response period, MissionHub ma"]);
    // The reported org's admins are notified (no allegation text); its audit starts here with no reporter data.
    expect(sql(`select title from public.notifications where user_id = '${tgt.id}' and kind = 'conduct.notice_sent'`)).toEqual(["You have a notice from MissionHub"]);
    expect(sql(`select count(*) from public.notifications where kind = 'conduct.notice_sent' and user_id = '${tgtMgr.id}'`)).toEqual(["0"]);
    expect(sql(`select action || '|' || (metadata ? 'notice_id')::text || '|' || (metadata::text like '%${sOrg.id}%')::text
                from public.audit_events where organization_id = '${tOrg.id}' and entity_id = '${caseId}'`)).toEqual(["conduct.notice_sent|true|false"]);
  });

  it("the reported org's admin reads the notice without reporter data; others get not found (AC-69, AC-75, AC-148)", async () => {
    const c = (await tgt.client.rpc("get_conduct_case_for_org", { p_org: tOrg.id, p_case: caseId })).data as Record<string, unknown>;
    const text = JSON.stringify(c);
    for (const leak of [src.id, sOrg.id, "Cond Sourcing", "They sent my candidate", "shared_outside", "hire_payout", pa.id]) expect(text).not.toContain(leak);
    const n = (c.notices as { rules_cited: { number: string }[]; rules_version_label: string; outcomes_line: string }[])[0];
    expect(n.rules_cited.map((r) => r.number)).toEqual(["2.3", "3.4"]);
    expect(n.rules_version_label).toBe("1.0");
    for (const u of [tgtMgr, src, outsider]) expect(err(await u.client.rpc("get_conduct_case_for_org", { p_org: tOrg.id, p_case: caseId }))).toBe("not_found");
    expect(((await tgtMgr.client.rpc("get_network_standing", { p_org: tOrg.id })).error?.message)).toBe("not_found");
  });

  it("the decision is locked until a response or the deadline (BR-27, AC-79)", async () => {
    expect(err(await decide(pa, caseId, noticeId, "breach", "warning"))).toBe("sanction_notice_required");
  });

  it("one response, by an org admin, before the deadline (AC-71, AC-72)", async () => {
    expect(err(await tgtMgr.client.rpc("submit_conduct_response", { p_org: tOrg.id, p_notice: noticeId, p_body: "We never shared the profile outside.", p_file_ids: [] }))).toBe("not_found");
    expect(err(await tgt.client.rpc("submit_conduct_response", { p_org: tOrg.id, p_notice: noticeId, p_body: "We never shared the profile outside.", p_file_ids: [] }))).toBe("ok");
    expect(err(await tgt.client.rpc("submit_conduct_response", { p_org: tOrg.id, p_notice: noticeId, p_body: "A second response is refused.", p_file_ids: [] }))).toBe("conduct_response_exists");
    expect(sql(`select count(*) from public.notifications n join public.profiles p on p.id = n.user_id where p.id = '${pa.id}' and n.kind = 'conduct.response_received'`)).not.toEqual(["0"]);
    // Reporter only sees "in review".
    expect(((await src.client.rpc("get_conduct_report", { p_org: sOrg.id, p_case: caseId })).data as { status: string }).status).toBe("in_review");
  });

  it("decision rules must come from the notice; a suspension needs 'why not a hold' (AC-84, AC-134)", async () => {
    expect(err(await decide(pa, caseId, noticeId, "breach", "warning", { p_rules_cited: ["4.8"] }))).toBe("decision_rules_not_in_notice");
    expect(err(await decide(pa, caseId, noticeId, "breach", "suspension"))).toBe("sanction_reason_required");
  });

  it("records a warning: both sides notified, review deadline stored, reporter sees only 'action taken' (AC-74, AC-80, AC-86)", async () => {
    expect(err(await decide(pa, caseId, noticeId, "breach", "warning"))).toBe("ok");
    expect(sql(`select level || '|' || (expires_at > now() + interval '11 months')::text from app.org_sanctions where case_id = '${caseId}'`)).toEqual(["warning|true"]);
    expect(sql(`select (review_request_due_at = app.add_business_days(decided_at, 10))::text from app.conduct_decisions where case_id = '${caseId}'`)).toEqual(["true"]);
    const rep = (await src.client.rpc("get_conduct_report", { p_org: sOrg.id, p_case: caseId })).data as Record<string, unknown>;
    expect(rep.status).toBe("action_taken");
    expect(JSON.stringify(rep)).not.toMatch(/warning|finding|We never shared/);
    const org = (await tgt.client.rpc("get_conduct_case_for_org", { p_org: tOrg.id, p_case: caseId })).data as { decision: { level: string; finding: string; can_request_review: boolean } };
    expect([org.decision.level, org.decision.can_request_review]).toEqual(["warning", true]);
    // Notifications carry no allegation, category, finding or level (AC-112).
    const bodies = sql(`select title || ' ' || coalesce(body, '') from public.notifications where link like '%${caseId}%'`).join(" ");
    expect(bodies).not.toMatch(/warning|shared|profile|agency|hire_payout|2\.3/i);
    // No platform admin id in anything the org reads (N10-D28).
    expect(JSON.stringify(org)).not.toContain(pa.id);
  });

  it("recruiter managers don't see conduct or sanction audit events; org admins do (AC-149)", async () => {
    const mgr = (await tgtMgr.client.from("audit_events").select("action").eq("organization_id", tOrg.id)).data!.map((r) => r.action);
    expect(mgr.some((a) => /^(conduct|sanction|settlement_mode)/.test(a))).toBe(false);
    expect(mgr).toContain("network_rules.org_accepted");
    const adm = (await tgt.client.from("audit_events").select("action").eq("organization_id", tOrg.id)).data!.map((r) => r.action);
    expect(adm).toEqual(expect.arrayContaining(["conduct.notice_sent", "conduct.response_submitted", "conduct.decided", "sanction.applied"]));
  });
});

describe("review (BR-31, EC-5, AC-91 to AC-95, AC-131)", () => {
  let reviewId: string;
  it("once, within the window, by an org admin of the sanctioned org", async () => {
    expect(err(await tgtMgr.client.rpc("request_sanction_review", { p_org: tOrg.id, p_case: caseId, p_text: "The finding misreads the email thread.", p_file_ids: [] }))).toBe("not_found");
    const r = await tgt.client.rpc("request_sanction_review", { p_org: tOrg.id, p_case: caseId, p_text: "The finding misreads the email thread.", p_file_ids: [] });
    expect(r.error).toBeNull();
    reviewId = r.data as string;
    expect(err(await tgt.client.rpc("request_sanction_review", { p_org: tOrg.id, p_case: caseId, p_text: "Again, please review this decision.", p_file_ids: [] }))).toBe("review_already_requested");
    const card = ((await pa.client.rpc("admin_list_conduct_cases")).data as { id: string; state: string }[]).find((x) => x.id === caseId)!;
    expect(card.state).toBe("review_requested");
  });

  it("the deciding admin can't review; nobody can increase", async () => {
    const reason = "Reviewed the whole record, including the response and the evidence.";
    expect(err(await pa.client.rpc("admin_decide_sanction_review", { p_review: reviewId, p_outcome: "confirm", p_new_level: null as unknown as string, p_reason: reason }))).toBe("review_not_allowed");
    expect(err(await pb.client.rpc("admin_decide_sanction_review", { p_review: reviewId, p_outcome: "reduce", p_new_level: "network_hold", p_reason: reason }))).toBe("review_cannot_increase");
    expect(err(await pb.client.rpc("admin_decide_sanction_review", { p_review: reviewId, p_outcome: "reduce", p_new_level: "warning", p_reason: reason }))).toBe("review_cannot_increase");
  });

  it("an overturn lifts the sanction, excludes it from 12-month counting and updates the reporter's outcome (AC-94, AC-131)", async () => {
    expect(err(await pb.client.rpc("admin_decide_sanction_review", { p_review: reviewId, p_outcome: "overturn", p_new_level: null as unknown as string, p_reason: "The email thread shows the client forwarded the profile, not the member." }))).toBe("ok");
    expect(sql(`select end_reason from app.org_sanctions where case_id = '${caseId}'`)).toEqual(["overturned"]);
    expect(sql(`select app.no_sanction_allowed('${tOrg.id}', null)::text`)).toEqual(["true"]);
    expect(((await src.client.rpc("get_conduct_report", { p_org: sOrg.id, p_case: caseId })).data as { status: string }).status).toBe("no_breach");
    expect(sql(`select title from public.notifications where user_id = '${src.id}' and kind = 'conduct_report.outcome_updated'`)).toEqual(["The outcome of your report changed"]);
    expect(sql(`select title from public.notifications where user_id = '${tgt.id}' and kind = 'sanction.reviewed'`)).toEqual(["Your review request was decided"]);
  });
});

describe("the no-level rule (N10-D24, AC-146)", () => {
  it("refuses 'breach, no level' with a non-overturned sanction or finding in 12 months", async () => {
    const o = await createUser("cond-nolevel");
    const org = await createOrg(o, "Cond No Level");
    const c1 = await adminCase(pa, org.id, "other");
    const n1 = await sendNotice(pa, c1, ["2.3"]);
    closeWindow(n1);
    expect(err(await decide(pa, c1, n1, "breach", null))).toBe("ok"); // first minor breach: finding only
    const c2 = await adminCase(pa, org.id, "other");
    const n2 = await sendNotice(pa, c2, ["2.3"]);
    closeWindow(n2);
    expect(err(await decide(pa, c2, n2, "breach", null))).toBe("no_sanction_not_allowed");
    expect(err(await decide(pa, c2, n2, "no_breach", null))).toBe("ok");
  });
});

describe("immediate hold (BR-28, AC-81 to AC-83, AC-141)", () => {
  it("only grounds 2.3 / 4.8; hold and notice in one transaction; refused on an already-restricted org", async () => {
    const o = await createUser("cond-hold");
    const org = await createOrg(o, "Cond Hold");
    const c = await adminCase(pa, org.id);
    const v = currentVersion();
    const args = { p_case: c, p_language: "en", p_conduct_date: today(), p_rules_version: v.id, p_rules_cited: [],
      p_allegation: "Forged candidate confirmations on three referrals.", p_alleged_when: "October 2026",
      p_evidence_summary: "Three confirmations came from the same IP as the member.", p_name_reporter: false };
    for (const g of ["3.4", "", "2.3; drop table x"]) expect(err(await pa.client.rpc("admin_apply_immediate_hold", { ...args, p_ground: g }))).toBe("immediate_hold_ground_invalid");
    expect(sql(`select count(*) from app.conduct_notices where case_id = '${c}'`)).toEqual(["0"]);
    const ok = await pa.client.rpc("admin_apply_immediate_hold", { ...args, p_ground: "4.8" });
    expect(ok.error).toBeNull();
    expect(sql(`select n.kind || '|' || array_to_string(n.rules_cited, ',') || '|' || (n.response_due_at = app.add_business_days(n.sent_at, 10))::text || '|' || s.level
                from app.conduct_notices n join app.org_sanctions s on s.notice_id = n.id where n.case_id = '${c}'`)).toEqual(["immediate_hold|4.8|true|network_hold"]);
    expect(((await o.client.rpc("get_my_org_state", { p_org: org.id })).data as { restriction: string }).restriction).toBe("network_hold");
    expect(sql(`select title from public.notifications where user_id = '${o.id}' and kind = 'sanction.immediate_hold'`)).toEqual(["You have an urgent notice from MissionHub"]);
    // A second immediate hold on the held org is refused, nothing created (N10-D16).
    const c2 = await adminCase(pa, org.id);
    expect(err(await pa.client.rpc("admin_apply_immediate_hold", { ...args, p_case: c2, p_ground: "2.3" }))).toBe("org_already_restricted");
    expect(sql(`select count(*) from app.conduct_notices where case_id = '${c2}'`)).toEqual(["0"]);
    // After the window: escalate on the same notice to a suspension (outcomes line present).
    const notice = sql(`select id::text from app.conduct_notices where case_id = '${c}'`)[0];
    expect(err(await decide(pa, c, notice, "breach", "termination", { p_rules_cited: ["4.8"] }))).toBe("sanction_notice_required");
    closeWindow(notice);
    // A notice without the outcomes line can't support an escalation (AC-83).
    sql(`update app.conduct_notices set outcomes_line = null, has_outcomes_line = false where id = '${notice}'`);
    expect(err(await decide(pa, c, notice, "breach", "suspension", { p_rules_cited: ["4.8"], p_why_not_hold: "Forgery across several referrals." }))).toBe("sanction_notice_required");
    sql(`update app.conduct_notices set outcomes_line = app.notice_outcomes_line('en'), has_outcomes_line = true where id = '${notice}'`);
    expect(err(await decide(pa, c, notice, "breach", "suspension", { p_rules_cited: ["4.8"], p_why_not_hold: "Forgery across several referrals." }))).toBe("ok");
    expect(sql(`select string_agg(level || ':' || coalesce(end_reason, 'active'), ',' order by applied_at) from app.org_sanctions where case_id = '${c}'`)).toEqual(["network_hold:superseded,suspension:active"]);
    expect(sql(`select (suspended_at is not null)::text from public.organizations where id = '${org.id}'`)).toEqual(["true"]);
    // The admin who applied the hold can't review the decision either (EC-5).
    const rv = await o.client.rpc("request_sanction_review", { p_org: org.id, p_case: c, p_text: "We dispute the forgery finding entirely.", p_file_ids: [] });
    expect(rv.error).toBeNull();
    sql(`update app.conduct_decisions set decided_by = '${pb.id}' where case_id = '${c}'`);
    expect(err(await pa.client.rpc("admin_decide_sanction_review", { p_review: rv.data as string, p_outcome: "confirm", p_new_level: null as unknown as string, p_reason: "The hold applier must not review this decision at all." }))).toBe("review_not_allowed");
    liftAll(org.id);
  });
});

describe("termination lift and legacy suspensions (N10-D29, N10-D30, AC-142, AC-150)", () => {
  it("the deciding admin can't lift a termination; another admin can, with a reason", async () => {
    const o = await createUser("cond-term");
    const org = await createOrg(o, "Cond Term");
    const c = await adminCase(pa, org.id);
    const n = await sendNotice(pa, c, ["2.3"]);
    closeWindow(n);
    expect(err(await decide(pa, c, n, "breach", "termination", { p_why_not_hold: "Repeated data leaks to outside agencies." }))).toBe("ok");
    expect(sql(`select (terminated_at is not null and suspended_at is not null)::text from public.organizations where id = '${org.id}'`)).toEqual(["true"]);
    expect(sql(`select count(*) from public.audit_events where organization_id = '${org.id}' and action = 'settlement_mode.entered'`)).toEqual(["1"]);
    const term = sql(`select id::text from app.org_sanctions where case_id = '${c}' and level = 'termination'`)[0];
    const file = (await pa.client.rpc("admin_org_conduct_file", { p_org: org.id })).data as { can_lift_termination: boolean };
    expect(file.can_lift_termination).toBe(false);
    expect(err(await pa.client.rpc("admin_lift_sanction", { p_org: org.id, p_sanction: term, p_reason: "Correcting an error in the record." }))).toBe("lift_not_allowed");
    expect(((await pb.client.rpc("admin_org_conduct_file", { p_org: org.id })).data as { can_lift_termination: boolean }).can_lift_termination).toBe(true);
    expect(err(await pb.client.rpc("admin_lift_sanction", { p_org: org.id, p_sanction: term, p_reason: "" }))).toBe("reason_required");
    expect(err(await pb.client.rpc("admin_lift_sanction", { p_org: org.id, p_sanction: term, p_reason: "Wrong org: the leak came from a namesake agency." }))).toBe("ok");
    expect(sql(`select (terminated_at is null and suspended_at is null)::text from public.organizations where id = '${org.id}'`)).toEqual(["true"]);
    expect(sql(`select app.no_sanction_allowed('${org.id}', null)::text`)).toEqual(["true"]);
    // The org's audit has no reason; the admin audit has it.
    expect(sql(`select (metadata ? 'reason')::text from public.audit_events where organization_id = '${org.id}' and action = 'sanction.lifted'`)).toEqual(["false"]);
    expect(sql(`select count(*) from public.audit_events where organization_id is null and action = 'sanction.lifted' and entity_id = '${org.id}' and metadata->>'reason' like 'Wrong org%'`)).toEqual(["1"]);
  });

  it("a legacy (pre-N10) suspension is lifted with sanction id null, nothing fabricated", async () => {
    const o = await createUser("cond-legacy");
    const org = await createOrg(o, "Cond Legacy");
    sql(`update public.organizations set suspended_at = now() - interval '30 days' where id = '${org.id}'`);
    const file = (await pa.client.rpc("admin_org_conduct_file", { p_org: org.id })).data as { legacy_suspended: boolean; sanctions: unknown[] };
    expect([file.legacy_suspended, file.sanctions.length]).toEqual([true, 0]);
    expect(sql(`select app.no_sanction_allowed('${org.id}', null)::text`)).toEqual(["true"]);
    expect(err(await pa.client.rpc("admin_lift_sanction", { p_org: org.id, p_sanction: null as unknown as string, p_reason: "Lifting the old suspension." }))).toBe("ok");
    expect(sql(`select (suspended_at is null)::text from public.organizations where id = '${org.id}'`)).toEqual(["true"]);
    expect(sql(`select title from public.notifications where user_id = '${o.id}' and kind = 'sanction.lifted'`)).toEqual(["A sanction on your organization was lifted"]);
  });
});

describe("2.3 incident notice (RD-045, AC-132)", () => {
  it("only after a 2.3 breach, to counterparties only, without the sanction", async () => {
    const bad = await createUser("cond-leaker");
    const badOrg = await createOrg(bad, "Cond Leaker");
    const victim = await createUser("cond-victim");
    const vOrg = await createOrg(victim, "Cond Victim");
    const ref = (await referralBetween(victim, vOrg.id, bad, badOrg.id)).referralId;
    const c = await adminCase(pa, badOrg.id, "shared_outside", ref);
    const n = await sendNotice(pa, c, ["2.3"]);
    const args = { p_case: c, p_recipient_orgs: [vOrg.id], p_referrals: [ref], p_information: "The candidate's CV and phone number.", p_when: "Early November 2026", p_to_whom: "Another agency", p_language: "en" };
    expect(err(await pa.client.rpc("admin_send_incident_notice", args))).toBe("incident_not_allowed");
    closeWindow(n);
    expect(err(await decide(pa, c, n, "breach", "warning"))).toBe("ok");
    expect(err(await pa.client.rpc("admin_send_incident_notice", { ...args, p_recipient_orgs: [badOrg.id] }))).toBe("incident_recipient_invalid");
    expect(err(await pa.client.rpc("admin_send_incident_notice", { ...args, p_recipient_orgs: [xOrg.id] }))).toBe("incident_recipient_invalid");
    const sent = await pa.client.rpc("admin_send_incident_notice", args);
    expect(sent.error).toBeNull();
    const notice = (await victim.client.rpc("get_incident_notice", { p_org: vOrg.id, p_notice: sent.data as string })).data as { guidance: { variant: string }[]; sides: string[] };
    expect([notice.sides, notice.guidance.map((g) => g.variant)]).toEqual([["source"], ["sourcing"]]);
    expect(JSON.stringify(notice)).not.toMatch(/warning|sanction|Cond Leaker/i);
    expect(err(await bad.client.rpc("get_incident_notice", { p_org: badOrg.id, p_notice: sent.data as string }))).toBe("not_found");
    expect(err(await outsider.client.rpc("get_incident_notice", { p_org: xOrg.id, p_notice: sent.data as string }))).toBe("not_found");
    expect(sql(`select title from public.notifications where user_id = '${victim.id}' and kind = 'conduct.incident_notice'`)).toEqual(["MissionHub sent you a data incident notice"]);
  });
});

describe("report from a partner job (BR-15 b) and self / internal refusal", () => {
  it("the job owner is the reported org; reporting a related org is refused", async () => {
    const owner = await createUser("cond-jobowner");
    const ownerOrg = await createOrg(owner, "Cond Job Owner");
    const job = await createJob(owner, ownerOrg.id);
    const cand = await createCandidate(src, sOrg.id);
    await drainQueue();
    const m = await admin().from("matches").select("id").eq("candidate_id", cand).eq("job_id", job).maybeSingle();
    expect(m.data).not.toBeNull();
    const ctx = (await src.client.rpc("get_conduct_report_context", { p_org: sOrg.id, p_match: m.data!.id })).data as { side: string; categories: string[] };
    expect([ctx.side, ctx.categories.length]).toEqual(["job", 5]);
    const r = await report(src, sOrg.id, { p_referral: null, p_match: m.data!.id, p_category: "job_terms" });
    expect(r.error).toBeNull();
    expect(sql(`select reported_org_id::text from app.conduct_cases where id = '${(r.data as { case_id: string }).case_id}'`)).toEqual([ownerOrg.id]);
    // Another org can't use that match id.
    expect(err(await report(outsider, xOrg.id, { p_referral: null, p_match: m.data!.id }))).toBe("not_found");
  });
});

describe("in-flight work during a suspension still allows reporting (AC-64)", () => {
  it("a suspended org's member reports on an in-flight referral", async () => {
    const s = await createUser("cond-susp");
    const so = await createOrg(s, "Cond Susp");
    const ref = (await referralBetween(s, so.id, tgt, tOrg.id)).referralId;
    sql(`update public.organizations set suspended_at = now() where id = '${so.id}'`);
    try {
      expect(err(await report(s, so.id, { p_referral: ref }))).toBe("ok");
      expect(err(await transition(tgt, ref, "accepted", tOrg.id))).toBe("ok");
    } finally {
      sql(`update public.organizations set suspended_at = null where id = '${so.id}'`);
    }
  });
});
