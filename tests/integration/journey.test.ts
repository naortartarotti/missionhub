import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, createCandidate, createJob, createOrg, createUser, drainQueue, sharingConsent, type TestUser } from "./helpers";
import { allocateMinor } from "@/lib/money/allocate";

let a: TestUser, b: TestUser, c: TestUser, platform: TestUser;
let orgA: { id: string }, orgB: { id: string };
let candidateA: string, jobB: string, referralId: string, placementId: string;

const version = async (u: TestUser, id: string) =>
  (await u.client.from("referrals").select("version").eq("id", id).single()).data!.version;

beforeAll(async () => {
  [a, b, c, platform] = await Promise.all([
    createUser("journey-a"), createUser("journey-b"), createUser("journey-c"), createUser("platform", { platformAdmin: true }),
  ]);
  orgA = await createOrg(a, "Journey A");
  orgB = await createOrg(b, "Journey B");
  await createOrg(c, "Journey C");
  candidateA = await createCandidate(a, orgA.id, { full_name: "Morgan Rivera", email: "morgan@example.com", phone: "+1 416 555 0100" });
  jobB = await createJob(b, orgB.id);
  await drainQueue();
});

describe("Journey A — match to settled placement", () => {
  it("A sees B's job as an opportunity with explanations", async () => {
    const { data, error } = await a.client.rpc("get_opportunities", { p_org: orgA.id });
    expect(error).toBeNull();
    const opp = data!.find((o) => o.job_id === jobB)!;
    expect(opp).toBeDefined();
    expect(opp.candidate_id).toBe(candidateA);
    expect(opp.band).toBe("strong");
    expect(JSON.stringify(opp.reasons)).toContain("typescript");
    expect(opp.client_label).toBe("Confidential client"); // B kept the client confidential
  });

  it("B sees only anonymized counts — never A's candidate identity", async () => {
    const { data } = await b.client.rpc("get_job_match_summary", { p_job: jobB });
    expect(data![0].strong_count).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(data)).not.toContain(candidateA);
    expect(JSON.stringify(data)).not.toContain("Morgan");
  });

  it("refuses submission without a job-specific sharing authorization", async () => {
    const { data: processing } = await a.client.from("candidate_consents").select("id").eq("candidate_id", candidateA).eq("kind", "processing").single();
    const { error } = await a.client.rpc("submit_referral", {
      p_candidate: candidateA, p_job: jobB, p_fields: ["headline", "skills"], p_document_ids: [],
      p_consent: processing!.id, p_idempotency_key: randomUUID(),
    });
    expect(error?.message).toMatch(/sharing_authorization_missing/);
  });

  it("A submits only approved fields; submission is idempotent", async () => {
    const consent = await sharingConsent(a, orgA.id, candidateA, jobB);
    const key = randomUUID();
    const args = {
      p_candidate: candidateA, p_job: jobB, p_fields: ["headline", "skills", "seniority", "location"],
      p_document_ids: [], p_consent: consent, p_idempotency_key: key, p_note: "Strong fit, available in January.",
    };
    const first = await a.client.rpc("submit_referral", args);
    expect(first.error).toBeNull();
    referralId = first.data as string;
    const replay = await a.client.rpc("submit_referral", args);
    expect(replay.data).toBe(referralId);
    const dup = await a.client.rpc("submit_referral", { ...args, p_idempotency_key: randomUUID() });
    expect(dup.error?.message).toMatch(/duplicate_referral/);
  });

  it("B receives a notification and the snapshot — without name, contacts or candidate id", async () => {
    const { data: notes } = await b.client.from("notifications").select("kind, link");
    expect(notes!.some((n) => n.kind === "referral.received")).toBe(true);
    const { data: profile } = await b.client.from("referral_shared_profiles").select("snapshot").eq("referral_id", referralId).single();
    const snap = JSON.stringify(profile!.snapshot);
    expect(snap).toContain("typescript");
    expect(snap).not.toContain("Morgan");
    expect(snap).not.toContain("morgan@example.com");
    expect(snap).not.toContain("555");
    const { data: link } = await b.client.from("referral_candidate_links").select("candidate_id").eq("referral_id", referralId);
    expect(link).toHaveLength(0);
    const { data: ref } = await b.client.from("referrals").select("*").eq("id", referralId).single();
    expect(JSON.stringify(ref)).not.toContain(candidateA);
  });

  it("C cannot see the referral at all", async () => {
    const { data } = await c.client.from("referrals").select("id").eq("id", referralId);
    expect(data).toHaveLength(0);
    const { error } = await c.client.rpc("transition_referral", { p_referral: referralId, p_to: "accepted", p_reason: "", p_expected_version: 1 });
    expect(error?.message).toMatch(/forbidden/);
  });

  it("rejects invalid jumps and wrong-side transitions", async () => {
    const v = await version(b, referralId);
    const jump = await b.client.rpc("transition_referral", { p_referral: referralId, p_to: "offer", p_reason: "", p_expected_version: v });
    expect(jump.error?.message).toMatch(/invalid_transition/);
    const wrongSide = await a.client.rpc("transition_referral", { p_referral: referralId, p_to: "accepted", p_reason: "", p_expected_version: v });
    expect(wrongSide.error?.message).toMatch(/invalid_transition/);
    const stale = await b.client.rpc("transition_referral", { p_referral: referralId, p_to: "accepted", p_reason: "", p_expected_version: v - 1 });
    expect(stale.error?.message).toMatch(/stale_version/);
  });

  it("B accepts; commercial stages require the agreement confirmed by A", async () => {
    const accepted = await b.client.rpc("transition_referral", { p_referral: referralId, p_to: "accepted", p_reason: "", p_expected_version: await version(b, referralId) });
    expect(accepted.error).toBeNull();
    const { data: agreement } = await a.client.from("collaboration_agreements").select("*").eq("referral_id", referralId).single();
    expect([agreement!.sourcing_bps, agreement!.job_owner_bps, agreement!.platform_bps]).toEqual([4500, 4500, 1000]);
    expect(agreement!.status).toBe("pending_source");

    const blocked = await b.client.rpc("transition_referral", { p_referral: referralId, p_to: "interviewing", p_reason: "", p_expected_version: await version(b, referralId) });
    expect(blocked.error?.message).toMatch(/agreement_required/);

    expect((await a.client.rpc("confirm_agreement", { p_referral: referralId })).error).toBeNull();
    for (const to of ["interviewing", "offer"] as const) {
      const r = await b.client.rpc("transition_referral", { p_referral: referralId, p_to: to, p_reason: "", p_expected_version: await version(b, referralId) });
      expect(r.error).toBeNull();
    }
  });

  it("a later rule change does not rewrite the frozen agreement", async () => {
    const { error } = await platform.client.rpc("publish_commission_rule", { p_name: "Standard marketplace split", p_sourcing: 5000, p_job_owner: 4000, p_platform: 1000 });
    expect(error).toBeNull();
    const { data } = await a.client.from("collaboration_agreements").select("sourcing_bps").eq("referral_id", referralId).single();
    expect(data!.sourcing_bps).toBe(4500);
    // restore default for other suites
    await platform.client.rpc("publish_commission_rule", { p_name: "Standard marketplace split", p_sourcing: 4500, p_job_owner: 4500, p_platform: 1000 });
  });

  it("B reports the hire → placement is created from the agreement snapshot", async () => {
    const { data, error } = await b.client.rpc("report_hire", {
      p_referral: referralId, p_fee_minor: 2_000_000, p_currency: "CAD", p_start_date: "2027-01-11", p_expected_version: await version(b, referralId),
    });
    expect(error).toBeNull();
    placementId = data as string;
    const { data: p } = await a.client.from("placements").select("status, contracted_fee_minor").eq("id", placementId).single();
    expect(p).toEqual({ status: "hire_reported", contracted_fee_minor: 2_000_000 });
  });

  it("unverified clicks never create ledger entries; recorder cannot self-verify", async () => {
    const noInvoice = await b.client.rpc("record_payment_evidence", {
      p_placement: placementId, p_kind: "client_payment", p_amount_minor: 2_000_000, p_processing_fee_minor: 0,
      p_occurred_on: "2027-02-01", p_reference: "WIRE-1", p_notes: "", p_idempotency_key: randomUUID(),
    });
    expect(noInvoice.error?.message).toMatch(/invoice_required/);
    expect((await b.client.rpc("record_invoice", {
      p_placement: placementId, p_number: "INV-1001", p_amount_minor: 2_000_000, p_tax_minor: 260_000, p_issued_on: "2027-01-15", p_due_on: "2027-02-14",
    })).error).toBeNull();

    const key = randomUUID();
    const ev = await b.client.rpc("record_payment_evidence", {
      p_placement: placementId, p_kind: "client_payment", p_amount_minor: 2_000_000, p_processing_fee_minor: 0,
      p_occurred_on: "2027-02-01", p_reference: "WIRE-REF-778", p_notes: "Bank statement attached offline", p_idempotency_key: key,
    });
    expect(ev.error).toBeNull();
    const replay = await b.client.rpc("record_payment_evidence", {
      p_placement: placementId, p_kind: "client_payment", p_amount_minor: 2_000_000, p_processing_fee_minor: 0,
      p_occurred_on: "2027-02-01", p_reference: "WIRE-REF-778", p_notes: "", p_idempotency_key: key,
    });
    expect(replay.data).toBe(ev.data);

    const { data: ledger0 } = await b.client.from("commission_ledger_entries").select("id").eq("placement_id", placementId);
    expect(ledger0).toHaveLength(0);

    const self = await b.client.rpc("review_payment_evidence", { p_evidence: ev.data as string, p_approve: true, p_note: "" });
    expect(self.error?.message).toMatch(/four_eyes_required|forbidden/);
    const sourcing = await a.client.rpc("review_payment_evidence", { p_evidence: ev.data as string, p_approve: true, p_note: "" });
    expect(sourcing.error?.message).toMatch(/forbidden/);

    const verified = await platform.client.rpc("review_payment_evidence", { p_evidence: ev.data as string, p_approve: true, p_note: "Matched bank statement" });
    expect(verified.error).toBeNull();
    const again = await platform.client.rpc("review_payment_evidence", { p_evidence: ev.data as string, p_approve: true, p_note: "" });
    expect(again.error?.message).toMatch(/already_reviewed/);
  });

  it("ledger allocates 45/45/10 exactly and matches the TS money utility", async () => {
    const { data } = await a.client.from("commission_ledger_entries").select("party, entry_type, amount_minor").eq("placement_id", placementId);
    const by = Object.fromEntries(data!.filter((e) => e.entry_type === "allocation").map((e) => [e.party, e.amount_minor]));
    expect(by).toEqual({ sourcing: 900_000, job_owner: 900_000, platform: 200_000 });
    expect(allocateMinor(2_000_000, [4500, 4500, 1000]).map(Number)).toEqual([by.sourcing, by.job_owner, by.platform]);
    const { data: p } = await a.client.from("placements").select("status").eq("id", placementId).single();
    expect(p!.status).toBe("commission_payable");
  });

  it("users cannot forge ledger rows or placement status directly", async () => {
    const ins = await b.client.from("commission_ledger_entries").insert({
      placement_id: placementId, entry_type: "payout", party: "sourcing", amount_minor: -900_000, currency: "CAD", idempotency_key: randomUUID(),
    });
    expect(ins.error).not.toBeNull();
    const upd = await b.client.from("placements").update({ status: "settled" }).eq("id", placementId).select();
    expect(upd.data ?? []).toHaveLength(0);
    const del = await admin().from("commission_ledger_entries").delete().eq("placement_id", placementId);
    expect(del.error?.message).toMatch(/immutable/);
  });

  it("payout verified by A and remittance verified by platform → settled", async () => {
    const over = await b.client.rpc("record_payment_evidence", {
      p_placement: placementId, p_kind: "sourcing_payout", p_amount_minor: 900_001, p_processing_fee_minor: 0,
      p_occurred_on: "2027-02-10", p_reference: "ETRANSFER-1", p_notes: "", p_idempotency_key: randomUUID(),
    });
    const overReview = await a.client.rpc("review_payment_evidence", { p_evidence: over.data as string, p_approve: true, p_note: "" });
    expect(overReview.error?.message).toMatch(/payout_exceeds_balance/);
    await a.client.rpc("review_payment_evidence", { p_evidence: over.data as string, p_approve: false, p_note: "Wrong amount" }).then(() => undefined);

    const payout = await b.client.rpc("record_payment_evidence", {
      p_placement: placementId, p_kind: "sourcing_payout", p_amount_minor: 900_000, p_processing_fee_minor: 0,
      p_occurred_on: "2027-02-10", p_reference: "ETRANSFER-2", p_notes: "", p_idempotency_key: randomUUID(),
    });
    expect((await a.client.rpc("review_payment_evidence", { p_evidence: payout.data as string, p_approve: true, p_note: "Received" })).error).toBeNull();

    const remit = await b.client.rpc("record_payment_evidence", {
      p_placement: placementId, p_kind: "platform_remittance", p_amount_minor: 200_000, p_processing_fee_minor: 0,
      p_occurred_on: "2027-02-10", p_reference: "WIRE-PLAT-1", p_notes: "", p_idempotency_key: randomUUID(),
    });
    expect((await platform.client.rpc("review_payment_evidence", { p_evidence: remit.data as string, p_approve: true, p_note: "" })).error).toBeNull();

    const { data: p } = await a.client.from("placements").select("status, settled_at").eq("id", placementId).single();
    expect(p!.status).toBe("settled");
    const { data: events } = await a.client.from("placement_status_events").select("to_status").eq("placement_id", placementId).order("id");
    expect(events!.map((e) => e.to_status)).toEqual(["hire_reported", "invoiced", "commission_payable", "settled"]);
  });

  it("A sees progress but not B's confidential client name", async () => {
    const { data: events } = await a.client.from("referral_status_events").select("to_status").eq("referral_id", referralId).order("id");
    expect(events!.map((e) => e.to_status)).toEqual(["submitted", "accepted", "interviewing", "offer", "hired"]);
    const { data: job } = await a.client.from("jobs").select("client_name").eq("id", jobB);
    expect(job).toHaveLength(0);
  });
});

describe("Journey B — revocation and expiry", () => {
  let cand: string, job: string, ref: string, consent: string;

  beforeAll(async () => {
    cand = await createCandidate(a, orgA.id, { full_name: "Riley Chen" });
    job = await createJob(b, orgB.id, { title: "Staff Engineer" });
    await drainQueue();
    consent = await sharingConsent(a, orgA.id, cand, job);
    const r = await a.client.rpc("submit_referral", {
      p_candidate: cand, p_job: job, p_fields: ["full_name", "skills"], p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID(),
    });
    expect(r.error).toBeNull();
    ref = r.data as string;
  });

  it("revoking the sharing authorization removes B's access to the snapshot", async () => {
    const before = await b.client.from("referral_shared_profiles").select("snapshot").eq("referral_id", ref);
    expect(before.data).toHaveLength(1);
    const { error } = await a.client.from("candidate_consents").update({ revoked_at: new Date().toISOString(), revoked_reason: "Candidate request" }).eq("id", consent);
    expect(error).toBeNull();
    const after = await b.client.from("referral_shared_profiles").select("snapshot").eq("referral_id", ref);
    expect(after.data).toHaveLength(0);
    const source = await a.client.from("referral_shared_profiles").select("snapshot").eq("referral_id", ref);
    expect(source.data).toHaveLength(1);
  });

  it("consent evidence cannot be rewritten or deleted", async () => {
    const upd = await a.client.from("candidate_consents").update({ evidence: "rewritten history" }).eq("id", consent);
    expect(upd.error).not.toBeNull();
    await a.client.from("candidate_consents").delete().eq("id", consent);
    const { data } = await admin().from("candidate_consents").select("evidence").eq("id", consent).single();
    expect(data!.evidence).toContain("Email confirmation");
  });

  it("closing a job expires its opportunities immediately", async () => {
    const before = await a.client.rpc("get_opportunities", { p_org: orgA.id });
    expect(before.data!.some((o) => o.job_id === job)).toBe(true);
    await b.client.from("jobs").update({ status: "closed" }).eq("id", job);
    const after = await a.client.rpc("get_opportunities", { p_org: orgA.id });
    expect(after.data!.some((o) => o.job_id === job)).toBe(false);
  });

  it("making a candidate unavailable removes them from B's counts", async () => {
    const before = (await b.client.rpc("get_job_match_summary", { p_job: jobB })).data![0];
    await a.client.from("candidates").update({ status: "unavailable" }).eq("id", candidateA);
    const after = (await b.client.rpc("get_job_match_summary", { p_job: jobB })).data![0];
    expect(after.strong_count + after.potential_count).toBeLessThan(before.strong_count + before.potential_count);
  });
});
