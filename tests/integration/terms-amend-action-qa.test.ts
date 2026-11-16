import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, createCandidate, createJob, createOrg, createUser, publishTerms, sharingConsent, sql, termsOf, type TestUser } from "./helpers";

/**
 * QA re-check of N2 follow-up F-1 (acceptance.md §3.3, PD-062; backend.md "v2.4 / F-1") at the
 * Server Action boundary: `amendReferralTerms` is a public POST endpoint, so it is called here
 * directly with forged FormData, as the real code runs (guard + Zod + the user-scoped client + the
 * real RPCs on the local stack). Only the Next.js request plumbing is replaced:
 *   - `createClient()` returns the acting test user's signed-in client (RLS and auth.uid() apply);
 *   - `getGlobalT()` returns the message key, so results are asserted on stable keys;
 *   - `revalidatePath` is a no-op (no request store outside Next).
 */
const acting = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => acting.client }));
vi.mock("@/i18n/server", () => ({ getGlobalT: async () => (key: string) => key }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { amendReferralTerms } = await import("@/features/admin/actions");

let a: TestUser, b: TestUser, c: TestUser, platform: TestUser;
let orgA: { id: string }, orgB: { id: string };
const uniq = () => randomUUID().slice(0, 8);
const one = (q: string) => sql(q)[0];
const as = (u: TestUser) => {
  acting.client = u.client;
};

beforeAll(async () => {
  [a, b, c, platform] = await Promise.all([createUser("f1q-a"), createUser("f1q-b"), createUser("f1q-c"), createUser("f1q-admin", { platformAdmin: true })]);
  orgA = await createOrg(a, "F1Q Agency A");
  orgB = await createOrg(b, "F1Q Hiring B");
  await createOrg(c, "F1Q Other C");
});
beforeEach(() => sql(`delete from app.rate_limits where user_id in ('${a.id}', '${b.id}', '${c.id}', '${platform.id}')`));
afterAll(() => {
  acting.client = null;
});

const FLAT_CAD = { p_fee_basis: "flat" as const, p_rate_bps: undefined, p_flat_fee_minor: 1_500_000, p_flat_currency: "CAD" };

/** A job with the given card (B) and a delivered referral from A on it. */
async function referred(terms: Parameters<typeof publishTerms>[2] = {}, jobOver: Record<string, unknown> = {}) {
  const job = await createJob(b, orgB.id, { title: `F1Q ${uniq()}`, client_name: `Client ${uniq()}`, accepts_external_referrals: false, ...jobOver });
  await publishTerms(b, job, terms);
  const cand = await createCandidate(a, orgA.id, { email: `f1q-${uniq()}@example.com` });
  const consent = await sharingConsent(a, orgA.id, cand, job);
  const { data, error } = await a.client.rpc("submit_referral", {
    p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline", "skills"], p_document_ids: [],
    p_consent: consent, p_idempotency_key: randomUUID(),
  }).single();
  if (error || data?.outcome !== "created") throw new Error(error?.message ?? data?.outcome);
  return { job, referralId: data.referral_id! };
}

/** A valid "switch to 20 % of base" amendment as the admin form posts it, plus overrides (forged fields). */
function form(referralId: string, over: Record<string, string | null> = {}) {
  const base: Record<string, string> = {
    referralId, feeBasis: "pct_base", feeRate: "20", minimumFee: "", searchType: "contingent_shared", guaranteeDays: "90",
    guaranteeRemedy: "replacement_then_prorata", paymentTermsDays: "30", ownershipMonths: "6",
    reason: "Both orgs moved to a percentage fee in writing.", hiringRequestReference: "email from B", sourcingRequestReference: "email from A",
    bothRequested: "on",
    // QA-N2-12: the % currency the admin saw (pct_amendment_currency); the tests' jobs are USD unless overridden.
    expectedPctCurrency: "USD",
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== null) fd.set(k, v);
  return fd;
}
const versions = (referralId: string) => Number(one(`select count(*) from public.job_terms_versions where referral_id = '${referralId}'`));
const latest = (referralId: string) =>
  one(`select fee_basis || ':' || currency || ':' || coalesce(min_fee_minor::text, '-') || ':' || coalesce(flat_fee_minor::text, '-') || ':' || coalesce(rate_bps::text, '-')
         from public.job_terms_versions where referral_id = '${referralId}' and kind = 'amendment' order by version_no desc limit 1`);

describe("F-1 re-check: amendReferralTerms Server Action with forged payloads", () => {
  it("flat CAD → % on a JPY-salaried job: the minimum is parsed in JPY (exponent 0), a forged `currency` is ignored", async () => {
    const { referralId } = await referred(FLAT_CAD, { salary_currency: "JPY" });
    as(platform);
    // A forged "CAD" would scale 150000 to 15,000,000 minor units; JPY keeps it at 150000.
    const r = await amendReferralTerms(null, form(referralId, { minimumFee: "150000", currency: "CAD", expectedPctCurrency: "JPY" }));
    expect(r).toMatchObject({ ok: true, message: "admin.referralTerms.messages.recorded" });
    expect(latest(referralId)).toBe("pct_base:JPY:150000:-:2000");
    // A fractional minimum is not valid JPY: refused on the field, nothing written.
    const r2 = await amendReferralTerms(null, form(referralId, { minimumFee: "1500.50", feeRate: "18", currency: "USD", expectedPctCurrency: "JPY" }));
    expect(r2.ok).toBe(false);
    expect(!r2.ok && r2.fieldErrors?.minimumFee).toEqual(["jobs.validation.minimumPositive"]);
    expect(versions(referralId)).toBe(1);
  });

  it("flat CAD → % on a USD job stores USD at the right scale even when the post claims EUR or a lower-case/garbage currency", async () => {
    const { referralId } = await referred(FLAT_CAD, { salary_currency: "USD" });
    as(platform);
    const r = await amendReferralTerms(null, form(referralId, { minimumFee: "12,500.25", currency: "xx" }));
    expect(r.ok).toBe(true);
    expect(latest(referralId)).toBe("pct_base:USD:1250025:-:2000");
    // % → % keeps the effective currency even after the job's salary currency moves (EUR), whatever is posted.
    await admin().from("jobs").update({ salary_currency: "EUR" }).eq("id", one(`select job_id from public.referrals where id = '${referralId}'`));
    const r2 = await amendReferralTerms(null, form(referralId, { feeRate: "18", minimumFee: "100", currency: "EUR" }));
    expect(r2.ok).toBe(true);
    expect(latest(referralId)).toBe("pct_base:USD:10000:-:1800");
  });

  it("a flat amendment uses flatCurrency only; a posted `currency` doesn't change it; a missing flatCurrency is a field error", async () => {
    const { referralId } = await referred({}, { salary_currency: "CAD" });
    as(platform);
    const r = await amendReferralTerms(null, form(referralId, { feeBasis: "flat", feeRate: null, flatFee: "15000", flatCurrency: "GBP", currency: "BRL" }));
    expect(r.ok).toBe(true);
    expect(latest(referralId)).toBe("flat:GBP:-:1500000:-");
    const r2 = await amendReferralTerms(null, form(referralId, { feeBasis: "flat", feeRate: null, flatFee: "16000", flatCurrency: null, currency: "GBP" }));
    expect(r2.ok).toBe(false);
    // Refused before any write, on the field the form renders (QA-N2-10; was the derived `currency` key).
    expect(r2).toEqual({ ok: false, error: "errors.invalidFields", fieldErrors: { flatCurrency: ["jobs.errors.termsIncomplete"] } });
    // A flat currency outside the allowed list is refused, not stored.
    const r3 = await amendReferralTerms(null, form(referralId, { feeBasis: "flat", feeRate: null, flatFee: "16000", flatCurrency: "JPY" }));
    expect(r3.ok).toBe(false);
    expect(versions(referralId)).toBe(1);
  });

  it("a % basis when pct_amendment_currency is null (job without a salary currency) → errors.terms_incomplete; nothing written", async () => {
    const { referralId, job } = await referred(FLAT_CAD);
    as(platform);
    // salary_currency is NOT NULL; relax it only for this job's check, and always restore it.
    sql(`alter table public.jobs alter column salary_currency drop not null; update public.jobs set salary_currency = null where id = '${job}'`);
    try {
      const lookup = (await platform.client.rpc("admin_get_referral_terms", { p_referral: referralId })).data as Record<string, unknown>;
      expect(lookup).toMatchObject({ job_salary_currency: null, pct_amendment_currency: null });
      for (const basis of ["pct_base", "pct_total_cash", "garbage", ""]) {
        const r = await amendReferralTerms(null, form(referralId, { feeBasis: basis, minimumFee: "100", currency: "CAD" }));
        expect(r).toMatchObject({ ok: false, error: "errors.terms_incomplete" });
      }
      // The flat basis still works without a salary currency.
      const ok = await amendReferralTerms(null, form(referralId, { feeBasis: "flat", feeRate: null, flatFee: "20000", flatCurrency: "CAD" }));
      expect(ok.ok).toBe(true);
      expect(versions(referralId)).toBe(1);
    } finally {
      sql(`update public.jobs set salary_currency = 'CAD' where id = '${job}'; alter table public.jobs alter column salary_currency set not null`);
    }
    expect(one(`select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'jobs' and column_name = 'salary_currency'`)).toBe("NO");
  });

  it("non-admin callers (sourcing admin, hiring admin, outsider) get errors.forbidden for existing and unknown ids alike; nothing written", async () => {
    const { referralId } = await referred(FLAT_CAD, { salary_currency: "USD" });
    for (const u of [a, b, c]) {
      as(u);
      const r1 = await amendReferralTerms(null, form(referralId, { minimumFee: "100" }));
      const r2 = await amendReferralTerms(null, form(randomUUID(), { minimumFee: "100" }));
      expect(r1).toEqual({ ok: false, error: "errors.forbidden" });
      expect(r2).toEqual(r1);
      // The lookup that carries pct_amendment_currency isn't readable either (no oracle).
      const look = await u.client.rpc("admin_get_referral_terms", { p_referral: referralId });
      expect(look.data).toBeNull();
      expect(look.error?.message).toMatch(/^not_found/);
    }
    expect(versions(referralId)).toBe(0);
  });

  it("an unknown referral id → errors.not_found; a malformed id → errors.invalidFields (no echo); an anonymous caller → forbidden", async () => {
    as(platform);
    expect(await amendReferralTerms(null, form(randomUUID(), { feeBasis: "flat", feeRate: null, flatFee: "1", flatCurrency: "CAD" }))).toEqual({ ok: false, error: "errors.not_found" });
    expect(await amendReferralTerms(null, form(randomUUID()))).toEqual({ ok: false, error: "errors.not_found" });
    const bad = await amendReferralTerms(null, form("not-a-uuid'; drop table x;--"));
    expect(bad.ok).toBe(false);
    expect(bad).toMatchObject({ ok: false, error: "errors.invalidFields" });
    expect(JSON.stringify(bad)).not.toMatch(/drop table|uuid/i);
    const { anon } = await import("./helpers");
    as({ id: "", email: "", client: anon() });
    const { referralId } = await referred(FLAT_CAD);
    expect(await amendReferralTerms(null, form(referralId))).toEqual({ ok: false, error: "errors.forbidden" });
    expect(versions(referralId)).toBe(0);
  });

  it("other forged fields: no bothRequested → field error; flatFee/flatCurrency sent on a % basis are dropped, not stored", async () => {
    const { referralId } = await referred(FLAT_CAD, { salary_currency: "USD" });
    as(platform);
    const r = await amendReferralTerms(null, form(referralId, { bothRequested: null }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fieldErrors?.bothRequested).toEqual(["admin.referralTerms.validation.bothAskedRequired"]);
    const r2 = await amendReferralTerms(null, form(referralId, { flatFee: "999999", flatCurrency: "GBP", p_both_requested: "false", p_flat_currency: "GBP" }));
    expect(r2.ok).toBe(true);
    expect(latest(referralId)).toBe("pct_base:USD:-:-:2000");
  });

  it("legacy referral (no snapshot): both bases map to a known error, never a raw one", async () => {
    const { referralId } = await referred(FLAT_CAD);
    // Make it look pre-N2 (snapshot columns are insert-only, so bypass the trigger as the legacy data would be).
    sql(`set session_replication_role = replica; update public.referrals set terms_version_id = null, fee_estimate_minor = null, commission_rule_id = null where id = '${referralId}'`);
    as(platform);
    const flat = await amendReferralTerms(null, form(referralId, { feeBasis: "flat", feeRate: null, flatFee: "1000", flatCurrency: "CAD" }));
    expect(flat).toEqual({ ok: false, error: "errors.amendment_legacy_referral" });
    const pct = await amendReferralTerms(null, form(referralId));
    // QA-N2-11: the legacy check runs first, so both bases answer amendment_legacy_referral.
    expect(pct).toEqual({ ok: false, error: "errors.amendment_legacy_referral" });
    expect(versions(referralId)).toBe(0);
  });
});
