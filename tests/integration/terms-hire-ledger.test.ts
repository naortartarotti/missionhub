import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { allocatePlacement } from "@/lib/money/allocate";
import { computeFee } from "@/lib/money/terms";
import { admin, createCandidate, createJob, createOrg, createUser, publishTerms, sharingConsent, sql, termsOf, dbNow, effectiveTerms, type TestUser } from "./helpers";

/**
 * N2 drop 2 (docs/specs/job-terms-card, brief rev. 2): report_hire v2 from the snapshot (BR-21 to BR-26),
 * the computed partner share in the ledger for both platform bases (BR-27 to BR-30), concierge amendments
 * (BR-34, BR-35) and the snapshot reads (BR-36).
 */

let a: TestUser, b: TestUser, c: TestUser, platform: TestUser;
let orgA: { id: string }, orgB: { id: string };
const uniq = () => randomUUID().slice(0, 8);
const one = (q: string) => sql(q)[0];
const referral = async (id: string) => (await admin().from("referrals").select("*").eq("id", id).single()).data!;

beforeAll(async () => {
  [a, b, c, platform] = await Promise.all([createUser("n2h-a"), createUser("n2h-b"), createUser("n2h-c"), createUser("n2h-admin", { platformAdmin: true })]);
  orgA = await createOrg(a, "N2H Agency A");
  orgB = await createOrg(b, "N2H Hiring B");
  await createOrg(c, "N2H Other C");
});
beforeEach(() => sql(`delete from app.rate_limits where user_id in ('${a.id}', '${b.id}', '${c.id}', '${platform.id}')`));

/** A job with the given card (B), a delivered referral from A on it. */
async function referred(terms: Parameters<typeof publishTerms>[2] = {}, jobOver: Record<string, unknown> = {}) {
  const job = await createJob(b, orgB.id, { title: `Hire ${uniq()}`, client_name: `Client ${uniq()}`, accepts_external_referrals: false, ...jobOver });
  await publishTerms(b, job, terms);
  const cand = await createCandidate(a, orgA.id, { email: `n2h-${uniq()}@example.com` });
  const consent = await sharingConsent(a, orgA.id, cand, job);
  const { data, error } = await a.client.rpc("submit_referral", {
    p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline", "skills"], p_document_ids: [],
    p_consent: consent, p_idempotency_key: randomUUID(),
  }).single();
  if (error || data?.outcome !== "created") throw new Error(error?.message ?? data?.outcome);
  return { job, referralId: data.referral_id! };
}

async function toOffer(referralId: string) {
  const step = async (u: TestUser, to: "accepted" | "interviewing" | "offer") => {
    const { error } = await u.client.rpc("transition_referral", { p_referral: referralId, p_to: to, p_reason: "", p_expected_version: (await referral(referralId)).version });
    if (error) throw new Error(error.message);
  };
  await step(b, "accepted");
  const conf = await a.client.rpc("confirm_agreement", { p_referral: referralId });
  if (conf.error) throw new Error(conf.error.message);
  await step(b, "interviewing");
  await step(b, "offer");
}

type HireArgs = { p_terms_version?: string; p_base_minor?: number; p_bonus_minor?: number; p_invoiced_fee_minor?: number; p_difference_reason?: string; p_difference_note?: string;
  p_legacy_fee_minor?: number; p_legacy_currency?: string; p_legacy_guarantee_days?: number };
const hire = async (referralId: string, args: HireArgs, u: TestUser = b) =>
  u.client.rpc("report_hire", { p_referral: referralId, p_start_date: "2027-01-11", p_expected_version: (await referral(referralId)).version, p_terms_version: effectiveTerms(referralId), ...args });
const placement = async (id: string) => (await admin().from("placements").select("*").eq("id", id).single()).data!;

/** B invoices and records a client payment; the platform admin verifies it (four-eyes). */
async function collect(placementId: string, amount: number, fee = 0, invoice: number = amount) {
  if (invoice > 0) {
    const inv = await b.client.rpc("record_invoice", { p_placement: placementId, p_number: `INV-${uniq()}`, p_amount_minor: invoice, p_tax_minor: 0, p_issued_on: "2027-01-11", p_due_on: "2027-02-10" });
    if (inv.error) throw new Error(inv.error.message);
  }
  const ev = await b.client.rpc("record_payment_evidence", {
    p_placement: placementId, p_kind: "client_payment", p_amount_minor: amount + fee, p_processing_fee_minor: fee, p_occurred_on: "2027-02-01",
    p_reference: `wire ${uniq()}`, p_notes: "", p_idempotency_key: randomUUID(),
  });
  if (ev.error) throw new Error(ev.error.message);
  const ok = await platform.client.rpc("review_payment_evidence", { p_evidence: ev.data as string, p_approve: true, p_note: "ok" });
  if (ok.error) throw new Error(ok.error.message);
  return ev.data as string;
}
const allocation = (evidenceId: string) =>
  Object.fromEntries(sql(`select party || '=' || amount_minor from public.commission_ledger_entries where payment_evidence_id = '${evidenceId}' and party <> 'client'`).map((x) => x.split("=")).map(([k, v]) => [k, Number(v)]));

// ---------------------------------------------------------------------------------------------
describe("report_hire v2 (BR-21 to BR-26)", () => {
  it("% of base: C from the frozen rate, currency and guarantee from the terms; I defaults to C", async () => {
    const { referralId } = await referred({ p_guarantee_days: 60 });
    await toOffer(referralId);
    const { data, error } = await hire(referralId, { p_base_minor: 9_000_000 });
    expect(error).toBeNull();
    const p = await placement(data as string);
    expect(p).toMatchObject({ computed_fee_minor: 1_800_000, contracted_fee_minor: 1_800_000, currency: "CAD", reported_base_minor: 9_000_000,
      reported_bonus_minor: null, fee_difference_reason: null, guarantee_until: "2027-03-12", terms_version_id: (await referral(referralId)).terms_version_id });
    // Base and bonus are never in audit metadata (BR-24).
    const { data: audit } = await admin().from("audit_events").select("metadata").eq("entity_id", data as string).eq("action", "placement.created").single();
    expect(audit!.metadata).toEqual({ fee_minor: 1_800_000, currency: "CAD", computed_fee_minor: 1_800_000, terms_version_id: p.terms_version_id });
  });

  it("total cash with a binding minimum; flat takes no base; no guarantee → no end date", async () => {
    const tc = await referred({ p_fee_basis: "pct_total_cash", p_rate_bps: 1500, p_min_fee_minor: 2_000_000, p_guarantee_days: 0, p_guarantee_remedy: undefined });
    await toOffer(tc.referralId);
    expect((await hire(tc.referralId, { p_base_minor: 10_000_000 })).error?.message).toMatch(/hire_base_invalid/); // bonus required
    const r1 = await hire(tc.referralId, { p_base_minor: 10_000_000, p_bonus_minor: 1_000_000 });
    expect(await placement(r1.data as string)).toMatchObject({ computed_fee_minor: 2_000_000, guarantee_until: null, reported_bonus_minor: 1_000_000 });
    expect(computeFee({ feeBasis: "pct_total_cash", rateBps: 1500, flatFeeMinor: null, minFeeMinor: 2_000_000 }, { baseMinor: 10_000_000, bonusMinor: 1_000_000 })).toBe(2_000_000);

    const flat = await referred({ p_fee_basis: "flat", p_rate_bps: undefined, p_flat_fee_minor: 2_500_000, p_flat_currency: "USD" });
    await toOffer(flat.referralId);
    expect((await hire(flat.referralId, { p_base_minor: 9_000_000 })).error?.message).toMatch(/hire_base_invalid/);
    const r2 = await hire(flat.referralId, {});
    expect(await placement(r2.data as string)).toMatchObject({ computed_fee_minor: 2_500_000, contracted_fee_minor: 2_500_000, currency: "USD", reported_base_minor: null });
  });

  it("refuses currency/guarantee (legacy params) on a snapshot referral and enforces the difference reason rules", async () => {
    const { referralId } = await referred();
    await toOffer(referralId);
    expect((await hire(referralId, { p_base_minor: 10_000_000, p_legacy_currency: "USD" })).error?.message).toMatch(/hire_terms_fixed/);
    expect((await hire(referralId, { p_base_minor: 10_000_000, p_legacy_guarantee_days: 30 })).error?.message).toMatch(/hire_terms_fixed/);
    expect((await hire(referralId, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_500_000 })).error?.message).toMatch(/fee_difference_reason_required/);
    expect((await hire(referralId, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_500_000, p_difference_reason: "other" })).error?.message).toMatch(/fee_difference_reason_required/);
    expect((await hire(referralId, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_500_000, p_difference_reason: "bribe" })).error?.message).toMatch(/fee_difference_reason_required/);
    expect((await hire(referralId, { p_base_minor: 10_000_000, p_difference_reason: "client_discount" })).error?.message).toMatch(/fee_difference_not_allowed/);
    const ok = await hire(referralId, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_600_000, p_difference_reason: "other", p_difference_note: "Client capped the fee at 16%." });
    expect(ok.error).toBeNull();
    expect(await placement(ok.data as string)).toMatchObject({ computed_fee_minor: 2_000_000, contracted_fee_minor: 1_600_000, fee_difference_reason: "other", fee_difference_note: "Client capped the fee at 16%." });
    // Placement fee facts are immutable, even for the service role.
    expect((await admin().from("placements").update({ contracted_fee_minor: 1 }).eq("id", ok.data as string)).error?.message).toMatch(/immutable/);
  });

  it("I ≠ C notifies the submitter with both amounts and the reason (spec §5.10)", async () => {
    const { referralId } = await referred();
    await toOffer(referralId);
    const since = dbNow();
    const { data } = await hire(referralId, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_600_000, p_difference_reason: "client_discount" });
    const { data: notes } = await admin().from("notifications").select("user_id, body, link").eq("kind", "placement.fee_difference").gte("created_at", since);
    expect(notes!.map((n) => n.user_id)).toEqual([a.id]);
    const title = (await referral(referralId)).job_title_snapshot;
    expect(notes![0].body).toBe(`N2H Hiring B reported a hire for ${title} with an invoiced fee of CAD 16,000.00 instead of the computed CAD 20,000.00. Reason: Client negotiated a lower fee.`);
    expect(notes![0].link).toBe(`/commissions/${data}`);
  });

  it("legacy referrals keep free entry; snapshot fields are refused for them", async () => {
    const { referralId } = await referred();
    await toOffer(referralId);
    sql(`set session_replication_role = replica;
         update public.referrals set terms_version_id = null, commission_rule_id = null, fee_estimate_minor = null where id = '${referralId}';
         update public.collaboration_agreements set terms_version_id = null where referral_id = '${referralId}'`);
    expect((await hire(referralId, { p_base_minor: 10_000_000, p_legacy_fee_minor: 1_000_000, p_legacy_currency: "CAD" })).error?.message).toMatch(/terms_not_recorded/);
    expect((await hire(referralId, { p_legacy_fee_minor: 1_000_000, p_legacy_currency: "CAD", p_legacy_guarantee_days: 400 })).error?.message).toMatch(/invalid_fee/);
    const ok = await hire(referralId, { p_legacy_fee_minor: 1_000_000, p_legacy_currency: "EUR", p_legacy_guarantee_days: 30 });
    expect(ok.error).toBeNull();
    expect(await placement(ok.data as string)).toMatchObject({ computed_fee_minor: null, contracted_fee_minor: 1_000_000, currency: "EUR", guarantee_until: "2027-02-10", terms_version_id: null });
  });

  it("only the hiring side reports the hire", async () => {
    const { referralId } = await referred();
    await toOffer(referralId);
    // N3 (spec §2.0): anyone who can't act gets not_found (was forbidden).
    expect((await hire(referralId, { p_base_minor: 10_000_000 }, a)).error?.message).toMatch(/not_found/);
    expect((await hire(referralId, { p_base_minor: 10_000_000 }, c)).error?.message).toMatch(/not_found/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("each I ≠ C reason code is accepted (BR-23)", () => {
  it.each(["client_discount", "client_contract_rate", "client_invoiced_other_currency", "invoice_correction"])("%s", async (reason) => {
    const { referralId } = await referred();
    await toOffer(referralId);
    const r = await hire(referralId, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_900_000, p_difference_reason: reason });
    expect(r.error).toBeNull();
    expect((await placement(r.data as string)).fee_difference_reason).toBe(reason);
  });
});

// ---------------------------------------------------------------------------------------------
describe("ledger allocation (BR-27 to BR-30)", () => {
  it("I ≥ C: exactly today's split", async () => {
    const { referralId } = await referred();
    await toOffer(referralId);
    const pid = (await hire(referralId, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 2_200_000, p_difference_reason: "client_contract_rate" })).data as string;
    expect(allocation(await collect(pid, 2_200_000))).toEqual({ sourcing: 990_000, job_owner: 990_000, platform: 220_000 });
  });

  it("I < C, collected (shipping value, PD-049): partial payments, negative-free here, then settlement", async () => {
    const { referralId } = await referred();
    await toOffer(referralId);
    const agreement = one(`select platform_basis from public.collaboration_agreements where referral_id = '${referralId}'`);
    expect(agreement).toBe("collected");
    const pid = (await hire(referralId, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 1_600_000, p_difference_reason: "client_discount" })).data as string;
    const e1 = await collect(pid, 800_000, 3_000, 1_600_000); // invoice I once; net 800,000 after a 3,000 processing fee
    expect(allocation(e1)).toEqual({ sourcing: 450_000, job_owner: 270_000, platform: 80_000 });
    expect((await placement(pid)).status).toBe("payment_partially_verified");
    const e2 = await collect(pid, 800_000, 0, 0);
    expect(allocation(e2)).toEqual({ sourcing: 450_000, job_owner: 270_000, platform: 80_000 });
    expect((await placement(pid)).status).toBe("commission_payable");
    // Payout of A's full floored share and the platform remittance settle the placement.
    const payout = await b.client.rpc("record_payment_evidence", { p_placement: pid, p_kind: "sourcing_payout", p_amount_minor: 900_000, p_processing_fee_minor: 0, p_occurred_on: "2027-02-05", p_reference: `po ${uniq()}`, p_notes: "", p_idempotency_key: randomUUID() });
    expect((await a.client.rpc("review_payment_evidence", { p_evidence: payout.data as string, p_approve: true, p_note: "received" })).error).toBeNull();
    const rem = await b.client.rpc("record_payment_evidence", { p_placement: pid, p_kind: "platform_remittance", p_amount_minor: 160_000, p_processing_fee_minor: 0, p_occurred_on: "2027-02-05", p_reference: `rm ${uniq()}`, p_notes: "", p_idempotency_key: randomUUID() });
    expect((await platform.client.rpc("review_payment_evidence", { p_evidence: rem.data as string, p_approve: true, p_note: "ok" })).error).toBeNull();
    expect((await placement(pid)).status).toBe("settled");
  });

  it("I < C, frozen basis and a deep discount: negative job-owner allocation still settles", async () => {
    const { data: rule } = await platform.client.rpc("publish_commission_rule", { p_name: `N2 frozen ${uniq()}`, p_sourcing: 4500, p_job_owner: 4500, p_platform: 1000, p_platform_basis: "frozen" });
    let referralId: string;
    try {
      ({ referralId } = await referred());
    } finally {
      await platform.client.rpc("publish_commission_rule", { p_name: "Standard marketplace split", p_sourcing: 4500, p_job_owner: 4500, p_platform: 1000 });
    }
    expect((await referral(referralId)).commission_rule_id).toBe(rule);
    await toOffer(referralId);
    expect(one(`select platform_basis from public.collaboration_agreements where referral_id = '${referralId}'`)).toBe("frozen");
    const pid = (await hire(referralId, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 200_000, p_difference_reason: "client_discount" })).data as string;
    expect(allocation(await collect(pid, 200_000))).toEqual({ sourcing: 900_000, job_owner: -900_000, platform: 200_000 });
  });

  it("SQL app.allocate_placement and TS allocatePlacement agree (parity, 400 random cases)", () => {
    const cases = Array.from({ length: 400 }, (_, i) => {
      const invoiced = 1 + Math.floor(Math.random() * 5_000_000);
      const computed = i % 4 === 0 ? null : 1 + Math.floor(Math.random() * 5_000_000);
      const amount = (Math.random() < 0.2 ? -1 : 1) * (1 + Math.floor(Math.random() * invoiced));
      const s = [4500, 0, 5000, 3333][i % 4];
      const p = [1000, 1000, 500, 667][i % 4];
      return { amount, s, jo: 10000 - s - p, p, basis: i % 2 ? "frozen" : "collected", computed, invoiced } as const;
    });
    const values = cases.map((x) => `(${x.amount}, ${x.s}, ${x.jo}, ${x.p}, '${x.basis}'::public.platform_basis, ${x.computed ?? "null"}::bigint, ${x.invoiced})`).join(",");
    const rows = sql(`select array_to_string(app.allocate_placement(a, s, jo, p, b, c, i), ',') from (values ${values}) v(a, s, jo, p, b, c, i)`);
    const ts = cases.map((x) => {
      const r = allocatePlacement(x.amount, { sourcingBps: x.s, jobOwnerBps: x.jo, platformBps: x.p }, { computedMinor: x.computed, invoicedMinor: x.invoiced, platformBasis: x.basis });
      return [r.sourcing, r.jobOwner, r.platform].join(",");
    });
    expect(rows).toEqual(ts);
  });

  it("SQL app.compute_fee and TS computeFee agree", () => {
    const cases = Array.from({ length: 200 }, (_, i) => ({ basis: (["pct_base", "pct_total_cash"] as const)[i % 2], rate: 100 + (i * 37) % 4901, base: 1 + i * 98_765, bonus: i % 2 ? i * 1_111 : null, min: i % 3 ? null : 5_000_000 }));
    const values = cases.map((x) => `('${x.basis}'::public.fee_basis, ${x.rate}, ${x.base}::bigint, ${x.bonus ?? "null"}::bigint, ${x.min ?? "null"}::bigint)`).join(",");
    const rows = sql(`select app.compute_fee(b, r, null, m, base, bonus) from (values ${values}) v(b, r, base, bonus, m)`).map(Number);
    expect(rows).toEqual(cases.map((x) => computeFee({ feeBasis: x.basis, rateBps: x.rate, flatFeeMinor: null, minFeeMinor: x.min }, { baseMinor: x.base, bonusMinor: x.bonus })));
  });
});

// ---------------------------------------------------------------------------------------------
describe("concierge amendment (BR-34, BR-35)", () => {
  const amend = (u: TestUser, referralId: string, over: Record<string, unknown> = {}) =>
    u.client.rpc("admin_amend_referral_terms", {
      p_referral: referralId, p_reason: "Client renegotiated the fee mid-search.", p_hiring_request_reference: "email 2026-11-14 from B",
      p_sourcing_request_reference: "email 2026-11-14 from A", p_both_requested: true, p_fee_basis: "pct_base", p_rate_bps: 1800,
      p_search_type: "contingent_shared", p_guarantee_days: 90, p_guarantee_remedy: "replacement_then_prorata", p_payment_terms_days: 30, p_ownership_months: 6,
      ...over,
    });

  it("before the hire: a referral-scoped version, the agreement repointed, both orgs notified, the hire uses it", async () => {
    const { referralId } = await referred();
    await toOffer(referralId);
    const snap = (await referral(referralId)).terms_version_id;
    const since = dbNow();
    const { data: vid, error } = await amend(platform, referralId);
    expect(error).toBeNull();
    expect(one(`select kind || ':' || version_no || ':' || amends_version_id from public.job_terms_versions where id = '${vid}'`)).toBe(`amendment:1:${snap}`);
    expect(one(`select terms_version_id from public.collaboration_agreements where referral_id = '${referralId}'`)).toBe(vid);
    expect((await referral(referralId)).terms_version_id).toBe(snap); // the snapshot never changes
    const { data: notes } = await admin().from("notifications").select("organization_id, body").eq("kind", "referral.terms_amended").gte("created_at", since);
    expect(new Set(notes!.map((n) => n.organization_id))).toEqual(new Set([orgA.id, orgB.id]));
    expect(notes![0].body).toBe(`A platform admin recorded a terms amendment on the referral for ${(await referral(referralId)).job_title_snapshot}, at both organizations' written request. Review the new terms on the referral.`);
    // Both orgs read the amendment row; nobody but the admin RPC reads the reason.
    expect((await a.client.from("job_terms_versions").select("id").eq("id", vid as string)).data).toHaveLength(1);
    expect((await b.client.from("job_terms_versions").select("id").eq("id", vid as string)).data).toHaveLength(1);
    expect((await c.client.from("job_terms_versions").select("id").eq("id", vid as string)).data).toHaveLength(0);
    const { data: look } = await platform.client.rpc("admin_get_referral_terms", { p_referral: referralId });
    const l = look as { effective_terms_version_id: string; history: { kind: string; reason: string | null; hiring_request_reference: string | null }[]; client_label: string };
    expect(l.effective_terms_version_id).toBe(vid);
    expect(l.history.map((h) => h.kind)).toEqual(["job", "amendment"]);
    expect(l.history[1]).toMatchObject({ reason: "Client renegotiated the fee mid-search.", hiring_request_reference: "email 2026-11-14 from B" });
    expect(l.client_label).toBe("Confidential client");
    // The hire is computed on the amended 18%: no floor gap (BR-29).
    const pid = (await hire(referralId, { p_base_minor: 10_000_000 })).data as string;
    expect(await placement(pid)).toMatchObject({ computed_fee_minor: 1_800_000, terms_version_id: vid });
    expect((await amend(platform, referralId, { p_rate_bps: 1700 })).error?.message).toMatch(/amendment_after_hire/);
  });

  it("refusals: non-admin, legacy, no change, window after delivery; any status before a hire is allowed", async () => {
    const { referralId } = await referred();
    for (const u of [a, b, c]) expect((await amend(u, referralId)).error?.message).toMatch(/forbidden/);
    expect((await a.client.rpc("admin_get_referral_terms", { p_referral: referralId })).error?.message).toMatch(/not_found/);
    expect((await amend(platform, referralId, { p_rate_bps: 2000 })).error?.message).toMatch(/amendment_no_change/);
    expect((await amend(platform, referralId, { p_ownership_months: 12 })).error?.message).toMatch(/amendment_window_after_delivery/);
    expect((await amend(platform, referralId, { p_both_requested: false })).error?.message).toMatch(/amendment_reason_required/);
    // Declined referral, no placement → allowed (RD-035, PD-051 Q-6).
    const v = (await referral(referralId)).version;
    expect((await b.client.rpc("review_referral", { p_referral: referralId, p_to: "declined", p_reason_code: "skills", p_note: "", p_expected_version: v })).error).toBeNull();
    expect((await amend(platform, referralId)).error).toBeNull();
    // Legacy referral.
    const legacy = await referred();
    sql(`set session_replication_role = replica; update public.referrals set terms_version_id = null, commission_rule_id = null, fee_estimate_minor = null where id = '${legacy.referralId}'`);
    expect((await amend(platform, legacy.referralId)).error?.message).toMatch(/amendment_legacy_referral/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("snapshot reads (BR-36)", () => {
  it("both sides learn the job's current version; others get not_found", async () => {
    const { job, referralId } = await referred();
    await publishTerms(b, job, { p_rate_bps: 2400 });
    for (const u of [a, b]) {
      const { data, error } = await u.client.rpc("get_referral_terms_context", { p_referral: referralId });
      expect(error).toBeNull();
      expect(data![0].job_current_version_no).toBe(2);
    }
    expect((await c.client.rpc("get_referral_terms_context", { p_referral: referralId })).error?.message).toMatch(/not_found/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("review fixes: stale terms at hire (copy-review P16) and fee bounds (QA-N2-02)", () => {
  const amendTo = (referralId: string, over: Record<string, unknown>) =>
    platform.client.rpc("admin_amend_referral_terms", {
      p_referral: referralId, p_reason: "Client changed the fee structure in writing.", p_hiring_request_reference: "email from B",
      p_sourcing_request_reference: "email from A", p_both_requested: true, p_fee_basis: "pct_base", p_rate_bps: 2000,
      p_search_type: "contingent_shared", p_guarantee_days: 90, p_guarantee_remedy: "replacement_then_prorata", p_payment_terms_days: 30, p_ownership_months: 6,
      ...over,
    });

  it("a dialog opened before an amendment can't record the hire: hire_terms_changed, then the new version works", async () => {
    const { referralId } = await referred();
    await toOffer(referralId);
    const shown = effectiveTerms(referralId)!;
    // % → flat while the dialog is open: the posted base would otherwise be silently ignored.
    const { error: aErr } = await amendTo(referralId, { p_fee_basis: "flat", p_rate_bps: undefined, p_flat_fee_minor: 1_700_000, p_flat_currency: "CAD" });
    expect(aErr).toBeNull();
    expect((await hire(referralId, { p_terms_version: shown, p_base_minor: 10_000_000 })).error?.message).toMatch(/hire_terms_changed/);
    expect((await hire(referralId, { p_terms_version: undefined, p_base_minor: 10_000_000 })).error?.message).toMatch(/hire_terms_changed/);
    expect((await hire(referralId, { p_terms_version: randomUUID() })).error?.message).toMatch(/hire_terms_changed/);
    expect((await referral(referralId)).status).toBe("offer");
    const ok = await hire(referralId, {}); // the helper posts the current effective version
    expect(ok.error).toBeNull();
    expect(await placement(ok.data as string)).toMatchObject({ computed_fee_minor: 1_700_000, terms_version_id: effectiveTerms(referralId) });
  });

  it("a legacy referral refuses a terms version", async () => {
    const { referralId } = await referred();
    await toOffer(referralId);
    const v = effectiveTerms(referralId)!;
    sql(`set session_replication_role = replica;
         update public.referrals set terms_version_id = null, commission_rule_id = null, fee_estimate_minor = null where id = '${referralId}';
         update public.collaboration_agreements set terms_version_id = null where referral_id = '${referralId}'`);
    expect((await hire(referralId, { p_terms_version: v, p_legacy_fee_minor: 1_000_000, p_legacy_currency: "CAD" })).error?.message).toMatch(/terms_not_recorded/);
  });

  it("I and the base are bounded so the ledger stays in range", async () => {
    const { referralId } = await referred();
    await toOffer(referralId);
    const err = async (args: HireArgs) => (await hire(referralId, args)).error?.message;
    // C = 2,000,000 at 20% of 10,000,000: I must be within [20,000; 200,000,000].
    expect(await err({ p_base_minor: 10_000_000, p_invoiced_fee_minor: 19_999, p_difference_reason: "client_discount" })).toMatch(/hire_base_invalid/);
    expect(await err({ p_base_minor: 10_000_000, p_invoiced_fee_minor: 200_000_001, p_difference_reason: "client_contract_rate" })).toMatch(/hire_base_invalid/);
    expect(await err({ p_base_minor: 1_000_000_000_001 })).toMatch(/hire_base_invalid/);
    const ok = await hire(referralId, { p_base_minor: 10_000_000, p_invoiced_fee_minor: 20_000, p_difference_reason: "client_discount" });
    expect(ok.error).toBeNull();
  });

  it("allocate_placement raises invalid_fee instead of a raw bigint overflow", () => {
    expect(() => sql(`select app.allocate_placement(9000000000000000000, 4500, 4500, 1000, 'collected', 9000000000000000000, 1)`)).toThrow(/invalid_fee/);
    expect(() => allocatePlacement(9_000_000_000_000_000_000n, { sourcingBps: 4500, jobOwnerBps: 4500, platformBps: 1000 }, { computedMinor: 9_000_000_000_000_000_000n, invoicedMinor: 1, platformBasis: "collected" })).toThrow(/invalid_fee/);
  });
});

describe("amendment fee bounds (QA-N2-07)", () => {
  it("an amendment with a flat or minimum fee above 10^12 is refused with terms_incomplete", async () => {
    const { referralId } = await referred();
    const base = {
      p_referral: referralId, p_reason: "Client changed the fee in writing.", p_hiring_request_reference: "email B", p_sourcing_request_reference: "email A",
      p_both_requested: true, p_search_type: "contingent_shared" as const, p_guarantee_days: 90, p_guarantee_remedy: "replacement_then_prorata" as const,
      p_payment_terms_days: 30, p_ownership_months: 6,
    };
    const flat = await platform.client.rpc("admin_amend_referral_terms", { ...base, p_fee_basis: "flat", p_flat_fee_minor: 9_000_000_000_000_000_000, p_flat_currency: "CAD" });
    expect(flat.error?.message).toMatch(/terms_incomplete/);
    const min = await platform.client.rpc("admin_amend_referral_terms", { ...base, p_fee_basis: "pct_base", p_rate_bps: 2000, p_min_fee_minor: 1_000_000_000_001 });
    expect(min.error?.message).toMatch(/terms_incomplete/);
  });
});

describe("payment amount bound (QA-N2-08)", () => {
  it("client payment evidence above 10^12 minor units is refused with invalid_fee; allocate_minor no longer overflows", async () => {
    const { referralId } = await referred();
    await toOffer(referralId);
    const pid = (await hire(referralId, { p_base_minor: 10_000_000 })).data as string;
    await b.client.rpc("record_invoice", { p_placement: pid, p_number: `INV-${uniq()}`, p_amount_minor: 2_000_000, p_tax_minor: 0, p_issued_on: "2027-01-11", p_due_on: "2027-02-10" });
    const ev = await b.client.rpc("record_payment_evidence", {
      p_placement: pid, p_kind: "client_payment", p_amount_minor: 9_000_000_000_000_000_000, p_processing_fee_minor: 0, p_occurred_on: "2027-02-01",
      p_reference: `wire ${uniq()}`, p_notes: "", p_idempotency_key: randomUUID(),
    });
    expect(ev.error?.message).toMatch(/invalid_fee/);
    // Same result as before for normal amounts, and no raw overflow for extreme ones.
    expect(one(`select array_to_string(app.allocate_minor(1000001, array[4500, 4500, 1000]), ',')`)).toBe("450001,450000,100000");
    expect(one(`select array_to_string(app.allocate_minor(9000000000000000000, array[4500, 4500, 1000]), ',')`)).toBe("4050000000000000000,4050000000000000000,900000000000000000");
  });
});

// ---------------------------------------------------------------------------------------------
describe("F-1: flat → % amendment currency (PD-062)", () => {
  const FLAT_CAD = { p_fee_basis: "flat" as const, p_rate_bps: undefined, p_flat_fee_minor: 1_500_000, p_flat_currency: "CAD" };
  const toPct = {
    p_reason: "Client moved to a percentage fee in writing.", p_hiring_request_reference: "email from B", p_sourcing_request_reference: "email from A",
    p_both_requested: true, p_fee_basis: "pct_base" as const, p_rate_bps: 2000, p_min_fee_minor: 1_000_000, p_search_type: "contingent_shared" as const,
    p_guarantee_days: 90, p_guarantee_remedy: "replacement_then_prorata" as const, p_payment_terms_days: 30, p_ownership_months: 6,
  };

  it("a flat CAD referral amended to % on a USD-salaried job stores USD; the lookup exposes the currency", async () => {
    const { referralId } = await referred(FLAT_CAD, { salary_currency: "USD" });
    const before = (await platform.client.rpc("admin_get_referral_terms", { p_referral: referralId })).data as Record<string, unknown>;
    expect(before).toMatchObject({ job_salary_currency: "USD", pct_amendment_currency: "USD" });
    const { data: vid, error } = await platform.client.rpc("admin_amend_referral_terms", { p_referral: referralId, ...toPct });
    expect(error).toBeNull();
    expect(one(`select fee_basis || ':' || currency || ':' || min_fee_minor from public.job_terms_versions where id = '${vid}'`)).toBe("pct_base:USD:1000000");
    // Once the effective terms are %, a later % amendment keeps their currency, even if the job's salary currency changes.
    await admin().from("jobs").update({ salary_currency: "EUR" }).eq("id", (await referral(referralId)).job_id);
    const after = (await platform.client.rpc("admin_get_referral_terms", { p_referral: referralId })).data as Record<string, unknown>;
    expect(after).toMatchObject({ job_salary_currency: "EUR", pct_amendment_currency: "USD" });
    const { data: v2 } = await platform.client.rpc("admin_amend_referral_terms", { p_referral: referralId, ...toPct, p_rate_bps: 1800 });
    expect(one(`select currency from public.job_terms_versions where id = '${v2}'`)).toBe("USD");
  });

  it("a flat → % amendment on a job with no salary currency is refused with terms_incomplete (no raw NOT NULL error)", async () => {
    const { referralId } = await referred(FLAT_CAD);
    const jobId = (await referral(referralId)).job_id;
    // salary_currency is NOT NULL in the schema; relax it inside a rolled-back transaction to reach the guard.
    const call = () => sql(`begin;
      alter table public.jobs alter column salary_currency drop not null;
      update public.jobs set salary_currency = null where id = '${jobId}';
      select set_config('request.jwt.claims', '{"sub": "${platform.id}", "role": "authenticated"}', true);
      set local role authenticated;
      select public.admin_amend_referral_terms(p_referral => '${referralId}', p_reason => 'Client moved to a percentage fee.',
        p_hiring_request_reference => 'email B', p_sourcing_request_reference => 'email A', p_both_requested => true,
        p_fee_basis => 'pct_base', p_search_type => 'contingent_shared', p_guarantee_days => 90, p_payment_terms_days => 30,
        p_ownership_months => 6, p_rate_bps => 2000, p_guarantee_remedy => 'replacement_then_prorata');
      rollback;`);
    expect(call).toThrow(/terms_incomplete/);
    expect(call).not.toThrow(/null value|not-null/);
    // Nothing persisted: the column is NOT NULL again and the job keeps its currency.
    expect(one(`select is_nullable from information_schema.columns where table_name = 'jobs' and column_name = 'salary_currency'`)).toBe("NO");
    expect(one(`select salary_currency from public.jobs where id = '${jobId}'`)).toBe("CAD");
    expect(one(`select count(*) from public.job_terms_versions where referral_id = '${referralId}'`)).toBe("0");
  });
});
