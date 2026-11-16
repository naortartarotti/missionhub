import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, createCandidate, createJob, createOrg, createUser, drainQueue, opportunityFor, sharingConsent, sql, termsOf, effectiveTerms, type TestUser } from "./helpers";
import { countPendingReceivedReferrals } from "@/features/referrals/queries";
import type { RequestContext } from "@/server/auth/context";

/**
 * RD-036 (migration 20261115000300_recruiter_record_scope): inside an agency a plain recruiter sees
 * only their own candidates, referrals and commissions; org_admin and recruiter_manager see the
 * whole agency. Jobs stay readable by the whole agency but only the owner or a manager edits them.
 *
 * Sourcing agency A: admin `aAdmin`, recruiters `r1` (owns candidate C1) and `r2`, manager `aMgr`.
 * Hiring agency B:   admin `bAdmin`, recruiters `j1` (owns job J1) and `j2`, manager `bMgr`.
 */

let aAdmin: TestUser, r1: TestUser, r2: TestUser, aMgr: TestUser;
let bAdmin: TestUser, j1: TestUser, j2: TestUser, bMgr: TestUser;
let orgA: { id: string }, orgB: { id: string };
let c1: string, c2: string, jobJ1: string, referralId: string, placementId: string;

const member = (orgId: string, u: TestUser, role: "recruiter" | "recruiter_manager") =>
  sql(`insert into public.organization_memberships (organization_id, user_id, role, status) values ('${orgId}', '${u.id}', '${role}', 'active')`);

const version = async (id: string) => (await admin().from("referrals").select("version").eq("id", id).single()).data!.version;

const ids = (rows: { id: string }[] | null | undefined) => (rows ?? []).map((r) => r.id);

/** Minimal request context for the server query helpers (they only use db + organizationId). */
const ctxFor = (u: TestUser, orgId: string) => ({ db: u.client, organizationId: orgId, userId: u.id }) as unknown as RequestContext;

const notified = (link: string, kind: string) =>
  sql(`select user_id from public.notifications where link = '${link}' and kind = '${kind}'`);

beforeAll(async () => {
  [aAdmin, r1, r2, aMgr, bAdmin, j1, j2, bMgr] = await Promise.all([
    createUser("scope-a-admin"), createUser("scope-r1"), createUser("scope-r2"), createUser("scope-a-mgr"),
    createUser("scope-b-admin"), createUser("scope-j1"), createUser("scope-j2"), createUser("scope-b-mgr"),
  ]);
  orgA = await createOrg(aAdmin, "Scope Agency A");
  orgB = await createOrg(bAdmin, "Scope Agency B");
  member(orgA.id, r1, "recruiter");
  member(orgA.id, r2, "recruiter");
  member(orgA.id, aMgr, "recruiter_manager");
  member(orgB.id, j1, "recruiter");
  member(orgB.id, j2, "recruiter");
  member(orgB.id, bMgr, "recruiter_manager");

  // Job first, then candidates: the candidate-side matcher scores the pairs. (The job-side matcher fails
  // with "URI too long" once a job reaches a few hundred candidates; see job-terms-card qa-report.)
  jobJ1 = await createJob(j1, orgB.id);
  c1 = await createCandidate(r1, orgA.id, { full_name: "Robin Owner" });
  c2 = await createCandidate(r2, orgA.id, { full_name: "Sam Colleague" });
  await drainQueue();
});

describe("candidates: owner or manager only", () => {
  it("a recruiter lists and reads only their own candidates; managers and admins see the agency", async () => {
    expect(ids((await r1.client.from("candidates").select("id")).data)).toEqual(expect.arrayContaining([c1]));
    expect(ids((await r1.client.from("candidates").select("id")).data)).not.toContain(c2);
    expect(ids((await r2.client.from("candidates").select("id")).data)).not.toContain(c1);
    expect((await r2.client.from("candidates").select("*").eq("id", c1).maybeSingle()).data).toBeNull();
    for (const u of [aMgr, aAdmin]) {
      expect(ids((await u.client.from("candidates").select("id")).data)).toEqual(expect.arrayContaining([c1, c2]));
    }
  });

  it("child rows follow the candidate (consents, experiences, documents)", async () => {
    expect((await r1.client.from("candidate_consents").select("id").eq("candidate_id", c1)).data!.length).toBeGreaterThan(0);
    expect((await r2.client.from("candidate_consents").select("id").eq("candidate_id", c1)).data).toHaveLength(0);
    expect((await aMgr.client.from("candidate_consents").select("id").eq("candidate_id", c1)).data!.length).toBeGreaterThan(0);

    const exp = await r1.client.from("candidate_experiences")
      .insert({ organization_id: orgA.id, candidate_id: c1, title: "Engineer", company: "Acme" }).select("id").single();
    expect(exp.error).toBeNull();
    expect((await r2.client.from("candidate_experiences").select("id").eq("candidate_id", c1)).data).toHaveLength(0);
    const sneak = await r2.client.from("candidate_experiences")
      .insert({ organization_id: orgA.id, candidate_id: c1, title: "Injected", company: "X" });
    expect(sneak.error?.message).toMatch(/row-level security/);
    const consent = await r2.client.from("candidate_consents").insert({
      organization_id: orgA.id, candidate_id: c1, kind: "processing", scope: "x", evidence: "injected evidence", recorded_by: r2.id,
    });
    expect(consent.error?.message).toMatch(/row-level security/);
  });

  it("a recruiter cannot update a colleague's candidate, nor hand their own to someone else; a manager can", async () => {
    const upd = await r2.client.from("candidates").update({ headline: "pwned" }).eq("id", c1).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    expect((await admin().from("candidates").select("headline").eq("id", c1).single()).data!.headline).not.toBe("pwned");

    const handOff = await r1.client.from("candidates").update({ owner_id: r2.id }).eq("id", c1).select("id");
    expect(handOff.error?.message).toMatch(/row-level security/);
    expect((await admin().from("candidates").select("owner_id").eq("id", c1).single()).data!.owner_id).toBe(r1.id);

    const byMgr = await aMgr.client.from("candidates").update({ notes: "reviewed by manager" }).eq("id", c1).select("id");
    expect(ids(byMgr.data)).toEqual([c1]);
  });

  it("a recruiter cannot create a candidate owned by a colleague; a manager can assign an owner", async () => {
    const forged = await r2.client.from("candidates").insert({ organization_id: orgA.id, owner_id: r1.id, created_by: r2.id, full_name: "Forged" });
    expect(forged.error?.message).toMatch(/row-level security/);
    const assigned = await aMgr.client.from("candidates")
      .insert({ organization_id: orgA.id, owner_id: r2.id, created_by: aMgr.id, full_name: "Assigned by manager" }).select("id").single();
    expect(assigned.error).toBeNull();
  });

  it("storage: candidate files follow the candidate", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
    const own = await r1.client.storage.from("candidate-documents").upload(`${orgA.id}/${c1}/${randomUUID()}.pdf`, pdf, { contentType: "application/pdf" });
    expect(own.error).toBeNull();
    const theirs = await r2.client.storage.from("candidate-documents").upload(`${orgA.id}/${c1}/${randomUUID()}.pdf`, pdf, { contentType: "application/pdf" });
    expect(theirs.error?.message).toMatch(/row-level security|Unauthorized|403/i);
    expect((await r2.client.storage.from("candidate-documents").list(`${orgA.id}/${c1}`)).data ?? []).toHaveLength(0);
    expect((await aMgr.client.storage.from("candidate-documents").list(`${orgA.id}/${c1}`)).data!.length).toBeGreaterThan(0);
  });
});

describe("jobs: agency-wide read, owner or manager write", () => {
  it("a colleague reads the job but cannot edit it or release its referrals", async () => {
    expect(ids((await j2.client.from("jobs").select("id").eq("id", jobJ1)).data)).toEqual([jobJ1]);
    const edit = await j2.client.from("jobs").update({ title: "Hijacked" }).eq("id", jobJ1).select("id");
    expect(edit.data ?? []).toHaveLength(0);
    expect((await j2.client.rpc("decline_pending_for_job", { p_job: jobJ1 })).error?.message).toMatch(/forbidden/);
    const forged = await j2.client.from("jobs").insert({
      organization_id: orgB.id, owner_id: j1.id, created_by: j2.id, title: "Forged", description: "x",
    } as never);
    expect(forged.error?.message).toMatch(/row-level security/);
  });

  it("the owner and a manager can edit it", async () => {
    expect(ids((await j1.client.from("jobs").update({ description: "Owner edit." }).eq("id", jobJ1).select("id")).data)).toEqual([jobJ1]);
    expect(ids((await bMgr.client.from("jobs").update({ description: "Manager edit." }).eq("id", jobJ1).select("id")).data)).toEqual([jobJ1]);
  });
});

describe("opportunities: only the caller's own candidates", () => {
  it("get_opportunities, triage and mark-seen are per recruiter; managers see the agency", async () => {
    // Per pair (p_match): the full list is capped at PostgREST max_rows on a large local data set.
    const match = await opportunityFor(r1, orgA.id, c1, jobJ1);
    expect(match).toBeDefined();
    expect(match!.candidate_id).toBe(c1);
    expect(await opportunityFor(r2, orgA.id, c1, jobJ1)).toBeUndefined();
    const colleague = (await r2.client.rpc("get_opportunities", { p_org: orgA.id, p_candidate: c1 })).data ?? [];
    expect(colleague).toHaveLength(0);
    expect((await r2.client.rpc("get_opportunities", { p_org: orgA.id, p_match: match!.match_id })).data ?? []).toHaveLength(0);
    expect((await opportunityFor(aMgr, orgA.id, c1, jobJ1))?.candidate_id).toBe(c1);

    expect((await r2.client.rpc("set_match_triage", { p_org: orgA.id, p_match: match!.match_id, p_state: "dismissed" })).error?.message).toMatch(/not_found/);
    await r2.client.rpc("mark_matches_seen", { p_org: orgA.id, p_matches: [match!.match_id] });
    expect(sql(`select count(*) from public.match_triage where match_id = '${match!.match_id}'`)).toEqual(["0"]);
  });
});

describe("referrals: sent by candidate owner, received by job owner", () => {
  it("a colleague cannot submit someone else's candidate", async () => {
    const consent = await sharingConsent(r1, orgA.id, c1, jobJ1);
    const { error } = await r2.client.rpc("submit_referral", {
      p_candidate: c1, p_job: jobJ1, p_terms_version: await termsOf(jobJ1), p_fields: ["headline", "skills"], p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID(),
    });
    expect(error?.message).toMatch(/forbidden/);
  });

  it("the owner submits; only the job owner and managers of B are notified", async () => {
    const consent = await sharingConsent(r1, orgA.id, c1, jobJ1);
    const { data, error } = await r1.client.rpc("submit_referral", {
      p_candidate: c1, p_job: jobJ1, p_terms_version: await termsOf(jobJ1), p_fields: ["headline", "skills"], p_document_ids: [], p_consent: consent,
      p_idempotency_key: randomUUID(), p_note: "Great fit.",
    }).single();
    expect(error).toBeNull();
    expect(data?.outcome).toBe("created");
    referralId = data!.referral_id!;
    const got = notified(`/referrals/${referralId}`, "referral.received");
    expect(got).toEqual(expect.arrayContaining([j1.id, bMgr.id, bAdmin.id]));
    expect(got).not.toContain(j2.id);
  });

  it("sent side: the candidate owner and managers see it, a colleague does not", async () => {
    for (const u of [r1, aMgr, aAdmin]) expect(ids((await u.client.from("referrals").select("id").eq("id", referralId)).data)).toEqual([referralId]);
    expect((await r2.client.from("referrals").select("id").eq("id", referralId)).data).toHaveLength(0);
    for (const t of ["referral_status_events", "referral_messages", "referral_shared_profiles", "referral_candidate_links"] as const) {
      expect((await r2.client.from(t).select("referral_id").eq("referral_id", referralId)).data, t).toHaveLength(0);
      expect((await r1.client.from(t).select("referral_id").eq("referral_id", referralId)).data!.length, t).toBeGreaterThan(0);
    }
    expect((await r2.client.rpc("get_referral_presentation", { p_referral: referralId, p_acting_org: orgA.id })).error?.message).toMatch(/not_found/);
    expect((await r2.client.rpc("withdraw_referral", { p_referral: referralId, p_reason: "x", p_expected_version: await version(referralId), p_acting_org: orgA.id })).error?.message).toMatch(/not_found/);
    const msg = await r2.client.from("referral_messages").insert({ referral_id: referralId, author_id: r2.id, author_side: "source", body: "hi" });
    expect(msg.error?.message).toMatch(/row-level security/);
    const jobs = (await r2.client.rpc("get_sent_referral_jobs", { p_org: orgA.id })).data ?? [];
    expect(jobs.some((j) => j.job_id === jobJ1)).toBe(false);
    expect(((await r1.client.rpc("get_sent_referral_jobs", { p_org: orgA.id })).data ?? []).some((j) => j.job_id === jobJ1)).toBe(true);
  });

  it("received side: the job owner and managers see it, a colleague does not; badge counts follow", async () => {
    for (const u of [j1, bMgr, bAdmin]) expect(ids((await u.client.from("referrals").select("id").eq("id", referralId)).data)).toEqual([referralId]);
    expect((await j2.client.from("referrals").select("id").eq("id", referralId)).data).toHaveLength(0);
    expect((await j2.client.from("referral_shared_profiles").select("referral_id").eq("referral_id", referralId)).data).toHaveLength(0);
    expect((await j2.client.from("referral_status_events").select("id").eq("referral_id", referralId)).data).toHaveLength(0);
    expect((await j2.client.rpc("transition_referral", { p_referral: referralId, p_to: "under_review", p_reason: "", p_expected_version: await version(referralId) })).error?.message).toMatch(/forbidden/);
    expect(await j2.client.rpc("decline_referrals", { p_ids: [referralId], p_reason_code: "skills" }).then((r) => r.data)).toBe(0);
    expect((await j2.client.rpc("get_referral_presentation", { p_referral: referralId, p_acting_org: orgB.id })).error?.message).toMatch(/not_found/);

    expect(await countPendingReceivedReferrals(ctxFor(j1, orgB.id))).toBeGreaterThanOrEqual(1);
    expect(await countPendingReceivedReferrals(ctxFor(j2, orgB.id))).toBe(0);
    expect(await countPendingReceivedReferrals(ctxFor(bMgr, orgB.id))).toBeGreaterThanOrEqual(1);
  });

  it("status updates notify only the candidate owner and managers on the sourcing side", async () => {
    const r = await j1.client.rpc("transition_referral", { p_referral: referralId, p_to: "under_review", p_reason: "", p_expected_version: await version(referralId) });
    expect(r.error).toBeNull();
    const got = notified(`/referrals/${referralId}`, "referral.status");
    expect(got).toEqual(expect.arrayContaining([r1.id, aMgr.id, aAdmin.id]));
    expect(got).not.toContain(r2.id);
  });
});

describe("placements and commissions follow the referral", () => {
  beforeAll(async () => {
    const step = async (u: TestUser, to: "accepted" | "interviewing" | "offer") => {
      const { error } = await u.client.rpc("transition_referral", { p_referral: referralId, p_to: to, p_reason: "", p_expected_version: await version(referralId) });
      if (error) throw new Error(`${to}: ${error.message}`);
    };
    await step(j1, "accepted");
    const c = await r2.client.rpc("confirm_agreement", { p_referral: referralId });
    if (!c.error?.message.match(/forbidden/)) throw new Error("colleague confirmed the agreement");
    const ok = await r1.client.rpc("confirm_agreement", { p_referral: referralId });
    if (ok.error) throw new Error(ok.error.message);
    await step(j1, "interviewing");
    await step(j1, "offer");
    const denied = await j2.client.rpc("report_hire", {
      p_referral: referralId, p_terms_version: effectiveTerms(referralId), p_base_minor: 10_000_000, p_start_date: "2027-01-11", p_expected_version: await version(referralId),
    });
    if (!denied.error?.message.match(/forbidden|not_found/)) throw new Error("colleague reported the hire");  // N3: not_found
    const { data, error } = await j1.client.rpc("report_hire", {
      p_referral: referralId, p_terms_version: effectiveTerms(referralId), p_base_minor: 10_000_000, p_start_date: "2027-01-11", p_expected_version: await version(referralId),
    });
    if (error) throw new Error(error.message);
    placementId = data as string;
  });

  it("owners and managers on both sides see the placement and its rows; colleagues see nothing", async () => {
    for (const u of [r1, aMgr, aAdmin, j1, bMgr, bAdmin]) {
      expect(ids((await u.client.from("placements").select("id").eq("id", placementId)).data)).toEqual([placementId]);
    }
    for (const u of [r2, j2]) {
      expect((await u.client.from("placements").select("id").eq("id", placementId)).data).toHaveLength(0);
      expect((await u.client.from("placement_status_events").select("id").eq("placement_id", placementId)).data).toHaveLength(0);
      expect((await u.client.from("collaboration_agreements").select("id").eq("referral_id", referralId)).data).toHaveLength(0);
    }
  });

  it("colleagues cannot record invoices or evidence, or open disputes", async () => {
    const inv = await j2.client.rpc("record_invoice", { p_placement: placementId, p_number: "INV-1", p_amount_minor: 2_000_000, p_tax_minor: 0, p_issued_on: "2027-01-12", p_due_on: "2027-02-12" });
    expect(inv.error?.message).toMatch(/forbidden/);
    const ev = await j2.client.rpc("record_payment_evidence", {
      p_placement: placementId, p_kind: "client_payment", p_amount_minor: 1, p_processing_fee_minor: 0, p_occurred_on: "2027-01-12",
      p_reference: "x", p_notes: "", p_idempotency_key: randomUUID(),
    });
    expect(ev.error?.message).toMatch(/forbidden/);
    expect((await r2.client.rpc("open_dispute", { p_placement: placementId, p_reason: "I want to see this placement" })).error?.message).toMatch(/forbidden/);

    const ok = await j1.client.rpc("record_invoice", { p_placement: placementId, p_number: "INV-1", p_amount_minor: 2_000_000, p_tax_minor: 0, p_issued_on: "2027-01-12", p_due_on: "2027-02-12" });
    expect(ok.error).toBeNull();
    expect((await j2.client.from("invoice_records").select("id").eq("placement_id", placementId)).data).toHaveLength(0);
    expect((await bMgr.client.from("invoice_records").select("id").eq("placement_id", placementId)).data).toHaveLength(1);
  });

  it("the hire notification reaches the candidate owner and managers only", () => {
    const got = notified(`/commissions/${placementId}`, "placement.hired");
    expect(got).toEqual(expect.arrayContaining([r1.id, aMgr.id, aAdmin.id]));
    expect(got).not.toContain(r2.id);
  });
});

describe("when the owner leaves the agency", () => {
  it("managers keep seeing the records; after a portfolio transfer the new owner sees them", async () => {
    sql(`update public.organization_memberships set status = 'suspended' where organization_id = '${orgA.id}' and user_id = '${r1.id}'`);
    expect((await r1.client.from("candidates").select("id").eq("id", c1)).data).toHaveLength(0);
    expect(ids((await aMgr.client.from("candidates").select("id").eq("id", c1)).data)).toEqual([c1]);
    expect(ids((await aMgr.client.from("referrals").select("id").eq("id", referralId)).data)).toEqual([referralId]);
    expect((await r2.client.from("referrals").select("id").eq("id", referralId)).data).toHaveLength(0);

    const t = await aAdmin.client.rpc("transfer_member_portfolio", { p_org: orgA.id, p_from: r1.id, p_to: r2.id });
    expect(t.error).toBeNull();
    expect(ids((await r2.client.from("candidates").select("id").eq("id", c1)).data)).toEqual([c1]);
    expect(ids((await r2.client.from("referrals").select("id").eq("id", referralId)).data)).toEqual([referralId]);
    expect(ids((await r2.client.from("placements").select("id").eq("id", placementId)).data)).toEqual([placementId]);
  });
});
