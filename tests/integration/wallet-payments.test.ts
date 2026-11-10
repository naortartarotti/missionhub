import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { processPspEvent, sendCashout, type PaymentsGateway } from "@/server/queue/handlers/payments";
import { StripeError } from "@/server/integrations/stripe";
import { admin, createCandidate, createJob, createOrg, createUser, drainQueue, sharingConsent, type TestUser } from "./helpers";

// Money in (placement charges settled from provider events) and money out (cash-outs).
// The provider itself is never called here: these tests drive the service-role bookkeeping RPCs
// exactly the way the webhook worker does.

let a: TestUser, b: TestUser, platform: TestUser;
let orgA: { id: string }, orgB: { id: string };

const walletBalance = async (orgId: string, kind: "available" | "pending") => {
  const { data } = await admin().from("wallet_accounts").select("balance_minor").eq("organization_id", orgId).eq("kind", kind).eq("currency", "CAD").maybeSingle();
  return data?.balance_minor ?? 0;
};
const systemBalance = async (kind: "psp_clearing" | "platform_revenue" | "payout_in_transit") => {
  const { data } = await admin().from("wallet_accounts").select("balance_minor").is("organization_id", null).eq("kind", kind).eq("currency", "CAD").maybeSingle();
  return data?.balance_minor ?? 0;
};
const version = async (u: TestUser, id: string) => (await u.client.from("referrals").select("version").eq("id", id).single()).data!.version;

/** A (sourcing) refers a candidate to B's job; the hire is reported and the client payment verified. */
async function payablePlacement(feeMinor = 2_000_000) {
  const candidate = await createCandidate(a, orgA.id, { email: `c-${randomUUID().slice(0, 8)}@example.com` });
  const job = await createJob(b, orgB.id);
  await drainQueue();
  const consent = await sharingConsent(a, orgA.id, candidate, job);
  const sub = await a.client.rpc("submit_referral", {
    p_candidate: candidate, p_job: job, p_fields: ["headline", "skills"], p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID(),
  });
  if (sub.error) throw sub.error;
  const referral = sub.data as string;
  const step = async (to: "accepted" | "interviewing" | "offer") => {
    const r = await b.client.rpc("transition_referral", { p_referral: referral, p_to: to, p_reason: "", p_expected_version: await version(b, referral) });
    if (r.error) throw r.error;
  };
  await step("accepted");
  const conf = await a.client.rpc("confirm_agreement", { p_referral: referral });
  if (conf.error) throw conf.error;
  await step("interviewing");
  await step("offer");
  const hire = await b.client.rpc("report_hire", { p_referral: referral, p_fee_minor: feeMinor, p_currency: "CAD", p_start_date: "2027-01-11", p_expected_version: await version(b, referral) });
  if (hire.error) throw hire.error;
  const placement = hire.data as string;
  const inv = await b.client.rpc("record_invoice", { p_placement: placement, p_number: `INV-${randomUUID().slice(0, 6)}`, p_amount_minor: feeMinor, p_tax_minor: 0, p_issued_on: "2027-01-15", p_due_on: "2027-02-14" });
  if (inv.error) throw inv.error;
  const ev = await b.client.rpc("record_payment_evidence", {
    p_placement: placement, p_kind: "client_payment", p_amount_minor: feeMinor, p_processing_fee_minor: 0,
    p_occurred_on: "2027-02-01", p_reference: "WIRE-1", p_notes: "", p_idempotency_key: randomUUID(),
  });
  if (ev.error) throw ev.error;
  const ver = await platform.client.rpc("review_payment_evidence", { p_evidence: ev.data as string, p_approve: true, p_note: "ok" });
  if (ver.error) throw ver.error;
  return placement;
}

const settle = (chargeId: string, over: Partial<{ amount: number; currency: string; fee: number }> = {}, amount = 1_100_000) =>
  admin().rpc("wallet_settle_placement_charge", {
    p_charge: chargeId, p_session: `cs_test_${randomUUID()}`, p_payment_intent: `pi_test_${chargeId}`,
    p_amount_minor: over.amount ?? amount, p_currency: over.currency ?? "cad", p_fee_minor: over.fee ?? 0, p_available_at: new Date(Date.now() + 86_400_000).toISOString(),
  });

beforeAll(async () => {
  [a, b, platform] = await Promise.all([createUser("pay-a"), createUser("pay-b"), createUser("pay-platform", { platformAdmin: true })]);
  orgA = await createOrg(a, "Pay Sourcing");
  orgB = await createOrg(b, "Pay Owner");
  // The switch is platform-wide; start from the state a fresh database has.
  await platform.client.rpc("set_wallet_cashouts_enabled", { p_enabled: false });
});

afterAll(async () => {
  await platform.client.rpc("set_wallet_cashouts_enabled", { p_enabled: false });
  await platform.client.rpc("set_wallet_frozen", { p_org: orgA.id, p_frozen: false, p_reason: "" });
});

describe("placement charges — paying shares through the platform", () => {
  let placement: string;
  let chargeId: string;

  it("only the job owner can start a payment, and only when shares are payable", async () => {
    placement = await payablePlacement();
    expect((await a.client.rpc("create_placement_charge", { p_placement: placement })).error?.message).toMatch(/forbidden/);
    const created = await b.client.rpc("create_placement_charge", { p_placement: placement });
    expect(created.error).toBeNull();
    chargeId = created.data as string;
    // A second click reuses the open charge instead of opening a second payment for the same debt.
    expect((await b.client.rpc("create_placement_charge", { p_placement: placement })).data).toBe(chargeId);
    const { data: c } = await b.client.from("placement_charges").select("sourcing_minor, platform_minor, amount_minor, status, payee_org_id").eq("id", chargeId).single();
    expect(c).toEqual({ sourcing_minor: 900_000, platform_minor: 200_000, amount_minor: 1_100_000, status: "created", payee_org_id: orgA.id });
  });

  it("settles once: wallet credited net of fees, commission ledger discharged, placement settled", async () => {
    const [pending0, revenue0, clearing0] = [await walletBalance(orgA.id, "pending"), await systemBalance("platform_revenue"), await systemBalance("psp_clearing")];
    const first = await settle(chargeId, { fee: 33_000 });
    expect(first.error).toBeNull();
    expect(first.data).toBe("succeeded");
    // A redelivered webhook is a no-op.
    expect((await settle(chargeId, { fee: 33_000 })).data).toBe("succeeded");

    // Fee 33,000 split pro rata 900:200 → 27,000 + 6,000.
    expect(await walletBalance(orgA.id, "pending")).toBe(pending0 + 873_000);
    expect(await systemBalance("platform_revenue")).toBe(revenue0 + 194_000);
    expect(await systemBalance("psp_clearing")).toBe(clearing0 - 1_067_000);

    const { data: ledger } = await a.client.from("commission_ledger_entries").select("party, entry_type, amount_minor").eq("placement_id", placement).in("entry_type", ["payout", "remittance"]);
    expect(ledger).toEqual(expect.arrayContaining([
      { party: "sourcing", entry_type: "payout", amount_minor: -900_000 },
      { party: "platform", entry_type: "remittance", amount_minor: -200_000 },
    ]));
    expect(ledger).toHaveLength(2);
    const { data: p } = await a.client.from("placements").select("status").eq("id", placement).single();
    expect(p!.status).toBe("settled");
    expect((await b.client.rpc("create_placement_charge", { p_placement: placement })).error?.message).toMatch(/commission_not_payable/);
  });

  it("releases pending to available when the provider says funds cleared, exactly once", async () => {
    const { data: job } = await admin().from("background_jobs").select("run_at, status").eq("kind", "wallet.release").eq("dedup_key", chargeId).single();
    expect(new Date(job!.run_at).getTime()).toBeGreaterThan(Date.now() + 80_000_000); // waits for available_on
    const [pending0, available0] = [await walletBalance(orgA.id, "pending"), await walletBalance(orgA.id, "available")];
    expect((await admin().rpc("wallet_release_placement_charge", { p_charge: chargeId })).data).toBe("released");
    expect((await admin().rpc("wallet_release_placement_charge", { p_charge: chargeId })).data).toBe("released");
    expect(await walletBalance(orgA.id, "pending")).toBe(pending0 - 873_000);
    expect(await walletBalance(orgA.id, "available")).toBe(available0 + 873_000);
  });

  it("parks a payment that does not match the charge in review, without posting anything", async () => {
    const other = await payablePlacement();
    const { data: id } = await b.client.rpc("create_placement_charge", { p_placement: other });
    const pending0 = await walletBalance(orgA.id, "pending");
    const res = await settle(id as string, { amount: 1_000 });
    expect(res.data).toBe("review");
    expect(await walletBalance(orgA.id, "pending")).toBe(pending0);
    const { data: c } = await admin().from("placement_charges").select("status, review_reason").eq("id", id as string).single();
    expect(c).toEqual({ status: "review", review_reason: "amount_mismatch" });
    const { data: p } = await a.client.from("placements").select("status").eq("id", other).single();
    expect(p!.status).toBe("commission_payable");
    // A later, correct delivery cannot silently post a charge an admin is reviewing.
    expect((await settle(id as string)).data).toBe("review");
  });

  it("closes abandoned checkouts and freezes the recipient when a paid charge is disputed", async () => {
    const other = await payablePlacement();
    const { data: open } = await b.client.rpc("create_placement_charge", { p_placement: other });
    await admin().rpc("wallet_close_placement_charge", { p_charge: open as string, p_status: "expired" });
    const { data: next } = await b.client.rpc("create_placement_charge", { p_placement: other });
    expect(next).not.toBe(open);

    expect((await admin().rpc("wallet_flag_placement_charge", { p_payment_intent: "pi_unknown", p_status: "disputed" })).data).toBe("unknown");
    const flagged = await admin().rpc("wallet_flag_placement_charge", { p_payment_intent: `pi_test_${chargeId}`, p_status: "disputed" });
    expect(flagged.data).toBe("disputed");
    const { data: freeze } = await a.client.from("wallet_freezes").select("reason").eq("organization_id", orgA.id).single();
    expect(freeze!.reason).toMatch(/disputed/);
  });

  it("keeps provider bookkeeping away from signed-in users", async () => {
    for (const call of [
      b.client.rpc("wallet_settle_placement_charge", { p_charge: chargeId, p_session: "x", p_payment_intent: "y", p_amount_minor: 1, p_currency: "cad", p_fee_minor: 0, p_available_at: new Date().toISOString() }),
      a.client.rpc("wallet_release_placement_charge", { p_charge: chargeId }),
      a.client.rpc("wallet_complete_cashout", { p_cashout: randomUUID(), p_transfer: "tr_x" }),
      a.client.rpc("wallet_set_payout_destination", { p_org: orgA.id, p_account: "acct_evil", p_user: a.id }),
      a.client.rpc("wallet_update_payout_destination", { p_account: "acct_x", p_details_submitted: true, p_payouts_enabled: true }),
      a.client.rpc("psp_record_event", { p_id: "evt_evil", p_type: "checkout.session.completed", p_payload: {} }),
    ]) {
      expect((await call).error?.message).toMatch(/permission denied/);
    }
    expect((await a.client.from("psp_events" as never).select("*")).error?.code).toBe("42501");
    for (const client of [a.client, admin()]) {
      expect((await client.from("placement_charges").update({ status: "succeeded" } as never).eq("id", chargeId)).error?.code).toBe("42501");
      expect((await client.from("payout_destinations").insert({ organization_id: orgA.id, psp_account_id: "acct_evil", payouts_enabled: true } as never)).error?.code).toBe("42501");
    }
  });
});

describe("provider event inbox", () => {
  it("records each event once and queues it for processing", async () => {
    const id = `evt_test_${randomUUID()}`;
    expect((await admin().rpc("psp_record_event", { p_id: id, p_type: "checkout.session.expired", p_payload: { object: { id: "cs_1" } } })).data).toBe(true);
    expect((await admin().rpc("psp_record_event", { p_id: id, p_type: "checkout.session.expired", p_payload: {} })).data).toBe(false);
    const { data: jobs } = await admin().from("background_jobs").select("id").eq("kind", "psp.event").eq("dedup_key", id);
    expect(jobs).toHaveLength(1);
    await admin().rpc("psp_complete_event", { p_id: id, p_outcome: "ignored" });
    const { data: ev } = await admin().from("psp_events").select("outcome, processed_at").eq("id", id).single();
    expect(ev!.outcome).toBe("ignored");
    expect(ev!.processed_at).not.toBeNull();
    await admin().from("background_jobs").update({ status: "succeeded" }).eq("kind", "psp.event").eq("dedup_key", id); // keep the shared queue clean
  });
});

describe("cash-outs", () => {
  const request = (u: TestUser, amount: number, key: string = randomUUID()) =>
    u.client.rpc("request_cashout", { p_org: orgA.id, p_currency: "CAD", p_amount_minor: amount, p_idempotency_key: key });

  it("requires the switch, an unfrozen wallet and a verified payout account", async () => {
    expect((await request(a, 1_000)).error?.message).toMatch(/wallet_cashouts_disabled/);
    expect((await a.client.rpc("set_wallet_cashouts_enabled", { p_enabled: true })).error?.message).toMatch(/forbidden/);
    expect((await platform.client.rpc("set_wallet_cashouts_enabled", { p_enabled: true })).error).toBeNull();
    expect((await request(a, 1_000)).error?.message).toMatch(/wallet_frozen/); // frozen by the dispute above
    await platform.client.rpc("set_wallet_frozen", { p_org: orgA.id, p_frozen: false, p_reason: "" });
    expect((await request(a, 1_000)).error?.message).toMatch(/payout_destination_required/);

    const acct = `acct_test_${randomUUID().slice(0, 8)}`;
    expect((await admin().rpc("wallet_set_payout_destination", { p_org: orgA.id, p_account: acct, p_user: a.id })).data).toBe(acct);
    expect((await admin().rpc("wallet_set_payout_destination", { p_org: orgA.id, p_account: "acct_other", p_user: a.id })).data).toBe(acct); // first writer wins
    expect((await request(a, 1_000)).error?.message).toMatch(/payout_destination_required/); // onboarding not finished
    await admin().rpc("wallet_update_payout_destination", { p_account: acct, p_details_submitted: true, p_payouts_enabled: true });
    expect((await request(b, 1_000)).error?.message).toMatch(/forbidden/); // not this organization's admin
  });

  it("reserves the amount at request time and settles it when the provider accepts the transfer", async () => {
    const [available0, transit0, clearing0] = [await walletBalance(orgA.id, "available"), await systemBalance("payout_in_transit"), await systemBalance("psp_clearing")];
    expect((await request(a, available0 + 1)).error?.message).toMatch(/insufficient_funds/);
    const key = randomUUID();
    const first = await request(a, 300_000, key);
    expect(first.error).toBeNull();
    expect((await request(a, 300_000, key)).data).toBe(first.data); // idempotent
    expect(await walletBalance(orgA.id, "available")).toBe(available0 - 300_000);
    expect(await systemBalance("payout_in_transit")).toBe(transit0 + 300_000);
    const { data: jobs } = await admin().from("background_jobs").select("id").eq("kind", "wallet.cashout").eq("dedup_key", first.data as string);
    expect(jobs).toHaveLength(1);

    expect((await admin().rpc("wallet_complete_cashout", { p_cashout: first.data as string, p_transfer: `tr_${randomUUID()}` })).data).toBe("paid");
    expect((await admin().rpc("wallet_complete_cashout", { p_cashout: first.data as string, p_transfer: "tr_again" })).data).toBe("paid");
    expect((await admin().rpc("wallet_fail_cashout", { p_cashout: first.data as string, p_reason: "late" })).data).toBe("paid"); // cannot undo a paid one
    expect(await systemBalance("payout_in_transit")).toBe(transit0);
    expect(await systemBalance("psp_clearing")).toBe(clearing0 + 300_000);
    expect(await walletBalance(orgA.id, "available")).toBe(available0 - 300_000);
    await admin().from("background_jobs").update({ status: "succeeded" }).eq("kind", "wallet.cashout").eq("dedup_key", first.data as string);
  });

  it("returns the reserve when the provider refuses the transfer; concurrent requests cannot overdraw", async () => {
    const available0 = await walletBalance(orgA.id, "available");
    const failed = await request(a, 100_000);
    expect((await admin().rpc("wallet_fail_cashout", { p_cashout: failed.data as string, p_reason: "account_closed" })).data).toBe("failed");
    expect(await walletBalance(orgA.id, "available")).toBe(available0);
    const { data: row } = await a.client.from("cashout_requests").select("status, failure_reason").eq("id", failed.data as string).single();
    expect(row).toEqual({ status: "failed", failure_reason: "account_closed" });

    const each = Math.floor(available0 / 2) - 1; // only 2 of 6 fit
    const results = await Promise.all(Array.from({ length: 6 }, () => request(a, each)));
    expect(results.filter((r) => !r.error)).toHaveLength(2);
    expect(await walletBalance(orgA.id, "available")).toBe(available0 - 2 * each);
    for (const r of results.filter((x) => !x.error)) await admin().rpc("wallet_fail_cashout", { p_cashout: r.data as string, p_reason: "test cleanup" });
    await admin().from("background_jobs").update({ status: "succeeded" }).eq("kind", "wallet.cashout").in("status", ["queued", "failed"]);
  });

  it("worker: sends the transfer once, bounces permanent refusals, and retries transient ones", async () => {
    const calls: string[] = [];
    const gateway = (impl: PaymentsGateway["createCashoutTransfer"]): PaymentsGateway => ({
      getPaymentSettlement: async () => null,
      createCashoutTransfer: async (input) => { calls.push(input.cashoutId); return impl(input); },
    });
    const available0 = await walletBalance(orgA.id, "available");
    const status = async (id: string) => (await admin().from("cashout_requests").select("status, failure_reason, psp_transfer_id").eq("id", id).single()).data!;

    const ok = (await request(a, 10_000)).data as string;
    await sendCashout(admin(), ok, gateway(async (i) => { expect(i).toMatchObject({ amountMinor: 10_000, currency: "CAD" }); return { id: "tr_ok_" + ok }; }));
    await sendCashout(admin(), ok, gateway(async () => { throw new Error("must not be called for a paid cash-out"); }));
    expect(await status(ok)).toEqual({ status: "paid", failure_reason: null, psp_transfer_id: "tr_ok_" + ok });
    expect(calls.filter((c) => c === ok)).toHaveLength(1);

    const refused = (await request(a, 20_000)).data as string;
    await sendCashout(admin(), refused, gateway(async () => { throw new StripeError(400, "account_closed", "closed"); }));
    expect(await status(refused)).toMatchObject({ status: "failed", failure_reason: "account_closed" });

    const flaky = (await request(a, 30_000)).data as string;
    await expect(sendCashout(admin(), flaky, gateway(async () => { throw new StripeError(503, "api_error", "down"); }))).rejects.toThrow();
    await expect(sendCashout(admin(), flaky, gateway(async () => { throw new StripeError(400, "balance_insufficient", "wait"); }))).rejects.toThrow();
    expect((await status(flaky)).status).toBe("requested"); // still reserved, the queue will retry
    await sendCashout(admin(), flaky, gateway(async () => ({ id: "tr_ok_" + flaky })));
    expect((await status(flaky)).status).toBe("paid");

    expect(await walletBalance(orgA.id, "available")).toBe(available0 - 10_000 - 30_000);
    await admin().from("background_jobs").update({ status: "succeeded" }).eq("kind", "wallet.cashout").in("status", ["queued", "failed"]);
  });

  it("worker: a stored checkout event settles its charge; an unpaid or foreign one is ignored", async () => {
    const placement = await payablePlacement();
    const { data: chargeId } = await b.client.rpc("create_placement_charge", { p_placement: placement });
    const gateway: PaymentsGateway = {
      getPaymentSettlement: async () => ({ feeMinor: 11_000, availableAt: new Date(Date.now() + 3_600_000) }),
      createCashoutTransfer: async () => { throw new Error("unused"); },
    };
    const record = async (type: string, object: Record<string, unknown>) => {
      const id = `evt_test_${randomUUID()}`;
      await admin().rpc("psp_record_event", { p_id: id, p_type: type, p_payload: { object } as never });
      return id;
    };
    const outcome = async (id: string) => (await admin().from("psp_events").select("outcome").eq("id", id).single()).data!.outcome;
    const session = { id: `cs_test_${randomUUID()}`, payment_intent: `pi_evt_${chargeId}`, amount_total: 1_100_000, currency: "cad", metadata: { charge_id: chargeId } };

    const unpaid = await record("checkout.session.completed", { ...session, payment_status: "unpaid" });
    await processPspEvent(admin(), unpaid, gateway);
    expect(await outcome(unpaid)).toBe("ignored:unpaid");
    const foreign = await record("checkout.session.completed", { ...session, payment_status: "paid", metadata: {} });
    await processPspEvent(admin(), foreign, gateway);
    expect(await outcome(foreign)).toBe("ignored:no_charge");

    // Stripe has not booked the charge yet: the event stays unprocessed for the queue to retry.
    const paid = await record("checkout.session.async_payment_succeeded", { ...session, payment_status: "paid" });
    await expect(processPspEvent(admin(), paid, { ...gateway, getPaymentSettlement: async () => null })).rejects.toThrow(/not available yet/);
    expect(await outcome(paid)).toBeNull();
    await processPspEvent(admin(), paid, gateway);
    expect(await outcome(paid)).toBe("charge:succeeded");
    const { data: c } = await admin().from("placement_charges").select("status, psp_fee_minor, payee_net_minor").eq("id", chargeId as string).single();
    expect(c).toEqual({ status: "succeeded", psp_fee_minor: 11_000, payee_net_minor: 891_000 });

    const dispute = await record("charge.dispute.created", { id: "dp_1", payment_intent: `pi_evt_${chargeId}` });
    await processPspEvent(admin(), dispute, gateway);
    expect(await outcome(dispute)).toBe("charge:disputed");
    await platform.client.rpc("set_wallet_frozen", { p_org: orgA.id, p_frozen: false, p_reason: "" });
    await admin().from("background_jobs").update({ status: "succeeded" }).eq("kind", "psp.event").in("status", ["queued", "failed"]);
  });

  it("leaves the book reconciled", async () => {
    await admin().from("background_jobs").update({ status: "succeeded" }).eq("kind", "wallet.release").in("status", ["queued", "failed"]);
    expect((await admin().rpc("wallet_reconcile")).data).toEqual([]);
  });
});
