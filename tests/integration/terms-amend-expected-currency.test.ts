import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, createCandidate, createJob, createOrg, createUser, publishTerms, sharingConsent, sql, termsOf, type TestUser } from "./helpers";

/**
 * N2 QA-N2-12 (qa-report.md §11.2; backend.md v2.5): a % amendment carries the currency the admin saw
 * (`expectedPctCurrency` = the lookup's `pct_amendment_currency` at page load). When the currency the
 * amendment would be stored in has moved (the job's salary currency changed during a flat → % review),
 * the Server Action and `admin_amend_referral_terms(p_expected_currency)` refuse with `stale_version`
 * and nothing is written. The race is made deterministic by changing the salary currency between
 * "page load" (the posted value) and the submit.
 *
 * Same harness as terms-amend-action-qa: the real action, guard, Zod and RPCs on the local stack; only
 * createClient (acting user's signed-in client), getGlobalT (keys) and revalidatePath are replaced.
 */
const acting = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => acting.client }));
vi.mock("@/i18n/server", () => ({ getGlobalT: async () => (key: string) => key }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { amendReferralTerms } = await import("@/features/admin/actions");

let a: TestUser, b: TestUser, platform: TestUser;
let orgA: { id: string }, orgB: { id: string };
const uniq = () => randomUUID().slice(0, 8);
const one = (q: string) => sql(q)[0];

beforeAll(async () => {
  [a, b, platform] = await Promise.all([createUser("n212-a"), createUser("n212-b"), createUser("n212-admin", { platformAdmin: true })]);
  orgA = await createOrg(a, "N212 Agency A");
  orgB = await createOrg(b, "N212 Hiring B");
});
beforeEach(() => {
  sql(`delete from app.rate_limits where user_id in ('${a.id}', '${b.id}', '${platform.id}')`);
  acting.client = platform.client;
});

const FLAT_CAD = { p_fee_basis: "flat" as const, p_rate_bps: undefined, p_flat_fee_minor: 1_500_000, p_flat_currency: "CAD" };

async function referred(terms: Parameters<typeof publishTerms>[2], salaryCurrency: string) {
  const job = await createJob(b, orgB.id, { title: `N212 ${uniq()}`, client_name: `Client ${uniq()}`, accepts_external_referrals: false, salary_currency: salaryCurrency });
  await publishTerms(b, job, terms);
  const cand = await createCandidate(a, orgA.id, { email: `n212-${uniq()}@example.com` });
  const consent = await sharingConsent(a, orgA.id, cand, job);
  const { data, error } = await a.client.rpc("submit_referral", {
    p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline", "skills"], p_document_ids: [],
    p_consent: consent, p_idempotency_key: randomUUID(),
  }).single();
  if (error || data?.outcome !== "created") throw new Error(error?.message ?? data?.outcome);
  return { job, referralId: data.referral_id! };
}

function form(referralId: string, over: Record<string, string | null> = {}) {
  const base: Record<string, string> = {
    referralId, feeBasis: "pct_base", feeRate: "20", minimumFee: "5000", searchType: "contingent_shared", guaranteeDays: "90",
    guaranteeRemedy: "replacement_then_prorata", paymentTermsDays: "30", ownershipMonths: "6",
    reason: "Both orgs moved to a percentage fee in writing.", hiringRequestReference: "email from B", sourcingRequestReference: "email from A",
    bothRequested: "on", expectedPctCurrency: "USD",
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== null) fd.set(k, v);
  return fd;
}
const versions = (referralId: string) => Number(one(`select count(*) from public.job_terms_versions where referral_id = '${referralId}' and kind = 'amendment'`));
const latest = (referralId: string) =>
  one(`select fee_basis || ':' || currency || ':' || coalesce(min_fee_minor::text, '-') from public.job_terms_versions
        where referral_id = '${referralId}' and kind = 'amendment' order by version_no desc limit 1`);
const setSalaryCurrency = (job: string, cur: string) => admin().from("jobs").update({ salary_currency: cur }).eq("id", job);

/** RPC arguments for a valid 20 % of base amendment (min 5,000.00). */
const rpcArgs = (referralId: string, over: Record<string, unknown> = {}) => ({
  p_referral: referralId, p_reason: "Both orgs agreed in writing.", p_hiring_request_reference: "email B", p_sourcing_request_reference: "email A",
  p_both_requested: true, p_fee_basis: "pct_base" as const, p_search_type: "contingent_shared" as const, p_guarantee_days: 90,
  p_guarantee_remedy: "replacement_then_prorata" as const, p_payment_terms_days: 30, p_ownership_months: 6, p_rate_bps: 2000,
  p_min_fee_minor: 500_000, ...over,
});

describe("QA-N2-12: amendReferralTerms refuses a % currency the admin didn't see", () => {
  it("flat CAD → % on a USD job: the salary currency moves to JPY after page load → errors.stale_version, nothing written; a fresh page (JPY) succeeds", async () => {
    const { job, referralId } = await referred(FLAT_CAD, "USD");
    // Page load: the lookup says USD (that's what the form posts as expectedPctCurrency).
    const lookup = (await platform.client.rpc("admin_get_referral_terms", { p_referral: referralId })).data as Record<string, unknown>;
    expect(lookup.pct_amendment_currency).toBe("USD");
    await setSalaryCurrency(job, "JPY");
    // "5000" would be stored as JPY 5000 (≈ USD 33); "5000.50" would be an unexplained minimumPositive error.
    expect(await amendReferralTerms(null, form(referralId))).toEqual({ ok: false, error: "errors.stale_version" });
    expect(await amendReferralTerms(null, form(referralId, { minimumFee: "5000.50" }))).toEqual({ ok: false, error: "errors.stale_version" });
    expect(versions(referralId)).toBe(0);
    const ok = await amendReferralTerms(null, form(referralId, { minimumFee: "750000", expectedPctCurrency: "JPY" }));
    expect(ok).toMatchObject({ ok: true });
    expect(latest(referralId)).toBe("pct_base:JPY:750000");
  });

  it("a % post without expectedPctCurrency, or with a malformed one, is stale; lower case is normalised", async () => {
    const { referralId } = await referred(FLAT_CAD, "USD");
    for (const v of [null, "", "US", "usdx", "12$"]) {
      expect(await amendReferralTerms(null, form(referralId, { expectedPctCurrency: v }))).toEqual({ ok: false, error: "errors.stale_version" });
    }
    expect(versions(referralId)).toBe(0);
    expect(await amendReferralTerms(null, form(referralId, { expectedPctCurrency: " usd " }))).toMatchObject({ ok: true });
    expect(latest(referralId)).toBe("pct_base:USD:500000");
  });

  it("% → %: the effective currency is what counts; the job's new salary currency as the expected value is stale", async () => {
    const { job, referralId } = await referred({}, "USD");
    await setSalaryCurrency(job, "EUR");
    expect(await amendReferralTerms(null, form(referralId, { feeRate: "18", expectedPctCurrency: "EUR" }))).toEqual({ ok: false, error: "errors.stale_version" });
    expect(versions(referralId)).toBe(0);
    expect(await amendReferralTerms(null, form(referralId, { feeRate: "18", expectedPctCurrency: "USD" }))).toMatchObject({ ok: true });
    expect(latest(referralId)).toBe("pct_base:USD:500000");
  });

  it("a flat amendment ignores expectedPctCurrency (its currency is the declared flatCurrency)", async () => {
    const { referralId } = await referred({}, "USD");
    const r = await amendReferralTerms(null, form(referralId, { feeBasis: "flat", feeRate: null, minimumFee: null, flatFee: "15000", flatCurrency: "GBP", expectedPctCurrency: "BRL" }));
    expect(r).toMatchObject({ ok: true });
    expect(one(`select currency from public.job_terms_versions where referral_id = '${referralId}' and kind = 'amendment'`)).toBe("GBP");
  });

  it("the stale check doesn't create an oracle: non-admins still get forbidden, legacy referrals amendment_legacy_referral", async () => {
    const { referralId } = await referred(FLAT_CAD, "USD");
    acting.client = a.client;
    expect(await amendReferralTerms(null, form(referralId, { expectedPctCurrency: "JPY" }))).toEqual({ ok: false, error: "errors.forbidden" });
    acting.client = platform.client;
    sql(`set session_replication_role = replica; update public.referrals set terms_version_id = null, fee_estimate_minor = null, commission_rule_id = null where id = '${referralId}'`);
    expect(await amendReferralTerms(null, form(referralId, { expectedPctCurrency: "JPY" }))).toEqual({ ok: false, error: "errors.amendment_legacy_referral" });
    expect(versions(referralId)).toBe(0);
  });
});

describe("QA-N2-12: admin_amend_referral_terms(p_expected_currency)", () => {
  it("refuses stale_version when the stored % currency differs from p_expected_currency; null keeps the v2.4 behaviour", async () => {
    const { job, referralId } = await referred(FLAT_CAD, "USD");
    await setSalaryCurrency(job, "JPY");
    const stale = await platform.client.rpc("admin_amend_referral_terms", rpcArgs(referralId, { p_expected_currency: "USD" }));
    expect(stale.error?.message).toMatch(/^stale_version/);
    expect(versions(referralId)).toBe(0);
    // Matching (case-insensitive) → stored in JPY.
    const ok = await platform.client.rpc("admin_amend_referral_terms", rpcArgs(referralId, { p_expected_currency: "jpy" }));
    expect(ok.error).toBeNull();
    expect(latest(referralId)).toBe("pct_base:JPY:500000");
    // Omitted → no check (direct callers keep the v2.4 contract).
    const noCheck = await platform.client.rpc("admin_amend_referral_terms", rpcArgs(referralId, { p_rate_bps: 1800 }));
    expect(noCheck.error).toBeNull();
    expect(versions(referralId)).toBe(2);
  });

  it("ignores p_expected_currency on a flat basis; stale check runs after the admin, legacy and hire checks", async () => {
    const { referralId } = await referred({}, "USD");
    const flat = await platform.client.rpc("admin_amend_referral_terms", rpcArgs(referralId, {
      p_fee_basis: "flat", p_rate_bps: undefined, p_min_fee_minor: undefined, p_flat_fee_minor: 1_000_000, p_flat_currency: "CAD", p_expected_currency: "EUR",
    }));
    expect(flat.error).toBeNull();
    const nonAdmin = await b.client.rpc("admin_amend_referral_terms", rpcArgs(referralId, { p_expected_currency: "EUR" }));
    expect(nonAdmin.error?.message).toMatch(/^forbidden/);
    const unknown = await platform.client.rpc("admin_amend_referral_terms", rpcArgs(randomUUID(), { p_expected_currency: "EUR" }));
    expect(unknown.error?.message).toMatch(/^not_found/);
  });

  it("the old 15-argument signature is gone (one function, no overload) and anon can't execute the new one", () => {
    expect(one(`select count(*) from pg_proc where proname = 'admin_amend_referral_terms' and pronamespace = 'public'::regnamespace`)).toBe("1");
    expect(one(`select pronargs from pg_proc where proname = 'admin_amend_referral_terms' and pronamespace = 'public'::regnamespace`)).toBe("16");
    const fn = `public.admin_amend_referral_terms(uuid, text, text, text, boolean, public.fee_basis, public.search_type, integer, integer, integer, integer, bigint, bigint, char, public.guarantee_remedy, char)`;
    expect(one(`select has_function_privilege('anon', '${fn}', 'execute')`)).toBe("f");
    expect(one(`select has_function_privilege('authenticated', '${fn}', 'execute')`)).toBe("t");
  });
});
