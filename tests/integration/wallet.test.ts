import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, createCandidate, createJob, createOrg, createUser, drainQueue, sharingConsent, type TestUser } from "./helpers";

// A currency no other suite touches, so system-account assertions are isolated per run.
const CUR = "GBP";

let a: TestUser, b: TestUser, c: TestUser, recruiter: TestUser, platform: TestUser;
let orgA: { id: string }, orgB: { id: string }, orgC: { id: string };

const balance = async (orgId: string, kind: "available" | "pending") => {
  const { data } = await admin().from("wallet_accounts").select("balance_minor").eq("organization_id", orgId).eq("kind", kind).eq("currency", CUR).maybeSingle();
  return data?.balance_minor ?? 0;
};

/** Funds an org's available balance the way the payment worker will: funding, then release. */
const fund = async (orgId: string, amount: number) => {
  const f = await admin().rpc("wallet_record_funding", {
    p_org: orgId, p_currency: CUR, p_amount_minor: amount, p_platform_fee_minor: 0, p_placement: null as unknown as string, p_idempotency_key: `test-fund:${randomUUID()}`,
  });
  if (f.error) throw f.error;
  const r = await admin().rpc("wallet_release_pending", { p_org: orgId, p_currency: CUR, p_amount_minor: amount, p_idempotency_key: `test-release:${randomUUID()}` });
  if (r.error) throw r.error;
};

const transfer = (u: TestUser, from: string, to: string, amount: number, key: string = randomUUID()) =>
  u.client.rpc("wallet_transfer", { p_from_org: from, p_to_org: to, p_currency: CUR, p_amount_minor: amount, p_memo: "test", p_idempotency_key: key });

const setTransfers = async (enabled: boolean) => {
  const { error } = await platform.client.rpc("set_wallet_transfers_enabled", { p_enabled: enabled });
  if (error) throw error;
};

beforeAll(async () => {
  [a, b, c, recruiter, platform] = await Promise.all([
    createUser("wallet-a"), createUser("wallet-b"), createUser("wallet-c"), createUser("wallet-recruiter"),
    createUser("wallet-platform", { platformAdmin: true }),
  ]);
  orgA = await createOrg(a, "Wallet A");
  orgB = await createOrg(b, "Wallet B");
  orgC = await createOrg(c, "Wallet C");
  const { error: mErr } = await admin().from("organization_memberships").insert({ organization_id: orgA.id, user_id: recruiter.id, role: "recruiter" });
  if (mErr) throw mErr;

  // A and B become partners through a referral; C stays a stranger.
  const candidate = await createCandidate(a, orgA.id);
  const job = await createJob(b, orgB.id);
  await drainQueue();
  const consent = await sharingConsent(a, orgA.id, candidate, job);
  const { error } = await a.client.rpc("submit_referral", {
    p_candidate: candidate, p_job: job, p_fields: ["headline", "skills"], p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID(),
  });
  if (error) throw error;
});

// The switch is platform-wide: leave the stack the way a fresh database starts.
afterAll(async () => {
  await setTransfers(false);
  await platform.client.rpc("set_wallet_frozen", { p_org: orgA.id, p_frozen: false, p_reason: "" });
});

describe("wallet ledger — funding and release", () => {
  it("credits pending, recognises the platform fee, and releases to available", async () => {
    const key = `test-fund:${randomUUID()}`;
    const args = { p_org: orgA.id, p_currency: CUR, p_amount_minor: 45_000, p_platform_fee_minor: 10_000, p_placement: null as unknown as string, p_idempotency_key: key };
    const first = await admin().rpc("wallet_record_funding", args);
    expect(first.error).toBeNull();
    expect(await balance(orgA.id, "pending")).toBe(45_000);
    expect(await balance(orgA.id, "available")).toBe(0);

    const { data: entries } = await admin().from("wallet_entries").select("amount_minor, wallet_accounts!inner(kind)").eq("transaction_id", first.data as string);
    const byKind = Object.fromEntries(entries!.map((e) => [e.wallet_accounts.kind, e.amount_minor]));
    expect(byKind).toEqual({ psp_clearing: -55_000, pending: 45_000, platform_revenue: 10_000 });

    // Replaying the same event is a no-op; replaying the key with another amount is refused.
    const replay = await admin().rpc("wallet_record_funding", args);
    expect(replay.data).toBe(first.data);
    expect(await balance(orgA.id, "pending")).toBe(45_000);
    const tampered = await admin().rpc("wallet_record_funding", { ...args, p_amount_minor: 99_000 });
    expect(tampered.error?.message).toMatch(/idempotency_conflict/);

    const rel = await admin().rpc("wallet_release_pending", { p_org: orgA.id, p_currency: CUR, p_amount_minor: 45_000, p_idempotency_key: `test-release:${randomUUID()}` });
    expect(rel.error).toBeNull();
    expect(await balance(orgA.id, "pending")).toBe(0);
    expect(await balance(orgA.id, "available")).toBe(45_000);
  });

  it("cannot release more than is pending", async () => {
    const { error } = await admin().rpc("wallet_release_pending", { p_org: orgA.id, p_currency: CUR, p_amount_minor: 1, p_idempotency_key: `test-release:${randomUUID()}` });
    expect(error?.message).toMatch(/insufficient_funds/);
  });
});

describe("wallet ledger — transfers", () => {
  it("is switched off by default", async () => {
    await setTransfers(false);
    const { error } = await transfer(a, orgA.id, orgB.id, 100);
    expect(error?.message).toMatch(/wallet_transfers_disabled/);
  });

  it("moves funds atomically between partners and is idempotent", async () => {
    await setTransfers(true);
    const beforeA = await balance(orgA.id, "available");
    const beforeB = await balance(orgB.id, "available");
    const key = randomUUID();
    const first = await transfer(a, orgA.id, orgB.id, 5_000, key);
    expect(first.error).toBeNull();
    const replay = await transfer(a, orgA.id, orgB.id, 5_000, key);
    expect(replay.data).toBe(first.data);
    expect(await balance(orgA.id, "available")).toBe(beforeA - 5_000);
    expect(await balance(orgB.id, "available")).toBe(beforeB + 5_000);
    const changed = await transfer(a, orgA.id, orgB.id, 6_000, key);
    expect(changed.error?.message).toMatch(/idempotency_conflict/);

    const { data: notes } = await b.client.from("notifications").select("kind").eq("kind", "wallet.transfer_received");
    expect(notes).toHaveLength(1);
  });

  it("rejects overdrafts, bad amounts, strangers, self-transfers and non-admins", async () => {
    const available = await balance(orgA.id, "available");
    expect((await transfer(a, orgA.id, orgB.id, available + 1)).error?.message).toMatch(/insufficient_funds/);
    expect((await transfer(a, orgA.id, orgB.id, 0)).error?.message).toMatch(/invalid_amount/);
    expect((await transfer(a, orgA.id, orgB.id, -500)).error?.message).toMatch(/invalid_amount/);
    expect((await transfer(a, orgA.id, orgC.id, 100)).error?.message).toMatch(/invalid_recipient/);
    expect((await transfer(a, orgA.id, randomUUID(), 100)).error?.message).toMatch(/invalid_recipient/);
    expect((await transfer(a, orgA.id, orgA.id, 100)).error?.message).toMatch(/invalid_recipient/);
    expect((await transfer(recruiter, orgA.id, orgB.id, 100)).error?.message).toMatch(/forbidden/);
    // B cannot spend A's wallet by naming it as the sender.
    expect((await transfer(b, orgA.id, orgB.id, 100)).error?.message).toMatch(/forbidden/);
    expect(await balance(orgA.id, "available")).toBe(available);
  });

  it("never overdraws under concurrent spending", async () => {
    await fund(orgC.id, 0 + 1); // unrelated activity in the same currency
    const start = await balance(orgA.id, "available");
    const each = Math.floor(start / 3) - 1; // only 3 of 10 can fit
    const results = await Promise.all(Array.from({ length: 10 }, () => transfer(a, orgA.id, orgB.id, each)));
    const ok = results.filter((r) => !r.error);
    expect(ok).toHaveLength(3);
    for (const r of results.filter((x) => x.error)) expect(r.error!.message).toMatch(/insufficient_funds/);
    expect(await balance(orgA.id, "available")).toBe(start - 3 * each);
  });

  it("posts once when the same request is sent concurrently", async () => {
    await fund(orgA.id, 1_000);
    const start = await balance(orgA.id, "available");
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 6 }, () => transfer(a, orgA.id, orgB.id, 700, key)));
    expect(results.every((r) => !r.error)).toBe(true);
    expect(new Set(results.map((r) => r.data)).size).toBe(1);
    expect(await balance(orgA.id, "available")).toBe(start - 700);
  });

  it("does not deadlock on opposite-direction transfers", async () => {
    await Promise.all([fund(orgA.id, 2_000), fund(orgB.id, 2_000)]);
    const [startA, startB] = [await balance(orgA.id, "available"), await balance(orgB.id, "available")];
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => (i % 2 ? transfer(a, orgA.id, orgB.id, 100) : transfer(b, orgB.id, orgA.id, 100))),
    );
    expect(results.map((r) => r.error?.message ?? null)).toEqual(Array(12).fill(null));
    expect(await balance(orgA.id, "available")).toBe(startA);
    expect(await balance(orgB.id, "available")).toBe(startB);
  });

  it("blocks outgoing transfers from a frozen wallet, but still lets it receive", async () => {
    await fund(orgB.id, 500);
    expect((await a.client.rpc("set_wallet_frozen", { p_org: orgA.id, p_frozen: true, p_reason: "nope" })).error?.message).toMatch(/forbidden/);
    const frozen = await platform.client.rpc("set_wallet_frozen", { p_org: orgA.id, p_frozen: true, p_reason: "Test freeze" });
    expect(frozen.error).toBeNull();
    await fund(orgA.id, 300);
    expect((await transfer(a, orgA.id, orgB.id, 100)).error?.message).toMatch(/wallet_frozen/);
    expect((await transfer(b, orgB.id, orgA.id, 100)).error).toBeNull();
    await platform.client.rpc("set_wallet_frozen", { p_org: orgA.id, p_frozen: false, p_reason: "Test done" });
    expect((await transfer(a, orgA.id, orgB.id, 100)).error).toBeNull();
  });
});

describe("wallet ledger — isolation and tamper resistance", () => {
  it("shows each organization only its own accounts and entries", async () => {
    const mine = await a.client.from("wallet_accounts").select("organization_id, kind");
    expect(mine.data!.length).toBeGreaterThan(0);
    expect(mine.data!.every((r) => r.organization_id === orgA.id)).toBe(true); // no system or partner accounts

    const { data: accountsB } = await admin().from("wallet_accounts").select("id").eq("organization_id", orgB.id);
    const idsB = accountsB!.map((r) => r.id);
    const leak = await a.client.from("wallet_entries").select("id").in("account_id", idsB);
    expect(leak.data).toHaveLength(0);

    const stranger = await c.client.from("wallet_transactions").select("id, kind");
    expect(stranger.data!.every((t) => t.kind !== "transfer")).toBe(true);
    const recruiterView = await recruiter.client.from("wallet_accounts").select("id");
    expect(recruiterView.data!.length).toBeGreaterThan(0); // members can read, only admins can move
  });

  it("denies direct writes to users and to the service role", async () => {
    const { data: acc } = await admin().from("wallet_accounts").select("id").eq("organization_id", orgA.id).eq("kind", "available").eq("currency", CUR).single();
    for (const client of [a.client, admin()]) {
      const upd = await client.from("wallet_accounts").update({ balance_minor: 9_999_999 } as never).eq("id", acc!.id);
      expect(upd.error?.code).toBe("42501");
      const ins = await client.from("wallet_entries").insert({ transaction_id: randomUUID(), account_id: acc!.id, amount_minor: 1, balance_after_minor: 1 } as never);
      expect(ins.error?.code).toBe("42501");
      const del = await client.from("wallet_transactions").delete().neq("id", randomUUID());
      expect(del.error?.code).toBe("42501");
      const flag = await client.from("wallet_settings").update({ transfers_enabled: true } as never).eq("id", true);
      expect(flag.error?.code).toBe("42501");
    }
  });

  it("keeps system operations away from signed-in users", async () => {
    const f = await a.client.rpc("wallet_record_funding", {
      p_org: orgA.id, p_currency: CUR, p_amount_minor: 1_000_000, p_platform_fee_minor: 0, p_placement: null as unknown as string, p_idempotency_key: `evil:${randomUUID()}`,
    });
    expect(f.error?.message).toMatch(/permission denied/);
    const r = await a.client.rpc("wallet_release_pending", { p_org: orgA.id, p_currency: CUR, p_amount_minor: 1, p_idempotency_key: `evil:${randomUUID()}` });
    expect(r.error?.message).toMatch(/permission denied/);
    expect((await a.client.rpc("set_wallet_transfers_enabled", { p_enabled: true })).error?.message).toMatch(/forbidden/);
  });

  it("reconciles: cached balances match entries and the book sums to zero", async () => {
    const { data, error } = await admin().rpc("wallet_reconcile");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    // Platform admins can run the same check from the admin area; nobody else can.
    expect((await platform.client.rpc("wallet_reconcile")).data).toEqual([]);
    expect((await a.client.rpc("wallet_reconcile")).error?.message).toMatch(/forbidden/);
    const { data: accounts } = await admin().from("wallet_accounts").select("balance_minor, organization_id").eq("currency", CUR);
    expect(accounts!.reduce((s, r) => s + r.balance_minor, 0)).toBe(0);
    expect(accounts!.filter((r) => r.organization_id).every((r) => r.balance_minor >= 0)).toBe(true);
  });
});
