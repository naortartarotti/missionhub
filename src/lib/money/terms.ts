/**
 * N2 job terms card: shared constants and pure helpers. The database is the authority; these mirror
 * it for forms and displays (estimateFee is parity-tested against app.terms_estimate).
 */

export const FEE_BASES = ["pct_base", "pct_total_cash", "flat"] as const;
export type FeeBasis = (typeof FEE_BASES)[number];

export const SEARCH_TYPES = ["contingent_exclusive", "contingent_shared", "retained"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const GUARANTEE_DAYS = [0, 30, 60, 90, 120, 180] as const;
export const GUARANTEE_REMEDIES = ["replacement_only", "replacement_then_prorata", "prorata_refund", "full_refund"] as const;
export type GuaranteeRemedy = (typeof GUARANTEE_REMEDIES)[number];

/** T4 on a flat basis. On % bases the fee currency is the job's salary currency. */
export const FLAT_FEE_CURRENCIES = ["CAD", "USD", "EUR", "GBP", "BRL"] as const;

/** Largest fee, base or invoiced amount accepted, in minor units (QA-N2-02, QA-N2-07). */
export const MAX_FEE_MINOR = 1_000_000_000_000;

export const RATE_BPS_MIN = 100;
export const RATE_BPS_MAX = 5000;
export const PAYMENT_TERMS_MAX_DAYS = 90;
export const OWNERSHIP_MONTHS_MIN = 6;
export const OWNERSHIP_MONTHS_MAX = 12;

/** BR-1 defaults for a card that has never been published. */
export const TERMS_DEFAULTS = {
  feeBasis: "pct_base" as FeeBasis,
  searchType: "contingent_shared" as SearchType,
  guaranteeDays: 90,
  guaranteeRemedy: "replacement_then_prorata" as GuaranteeRemedy,
  paymentTermsDays: 30,
  ownershipMonths: 6,
};

/** The T1–T9 values of a terms version, in database units (bps, minor units). */
export type TermsValues = {
  feeBasis: FeeBasis;
  rateBps: number | null;
  flatFeeMinor: number | null;
  minFeeMinor: number | null;
  currency: string;
  searchType: SearchType;
  guaranteeDays: number;
  guaranteeRemedy: GuaranteeRemedy | null;
  paymentTermsDays: number;
  ownershipMonths: number;
};

/** "20" / "22.5" / "22.50" (a percent, up to 2 decimals) → basis points; null when malformed or outside 1–50 %. */
export function parseRateToBps(input: string | null | undefined): number | null {
  const s = (input ?? "").trim().replace(",", ".");
  const m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return bps >= RATE_BPS_MIN && bps <= RATE_BPS_MAX ? bps : null;
}

/** Basis points → the percent string the form shows ("20", "22.5"). */
export function bpsToRateInput(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "";
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}

/** Half-up integer division for non-negative bigints. */
const divHalfUp = (n: bigint, d: bigint) => (2n * n + d) / (2n * d);

/**
 * BR-9 / BR-11 money estimate, identical to SQL app.terms_estimate: flat → the flat amount; % bases →
 * rate × salary band midpoint (half-up), at least the minimum fee, only when share_salary is on and a
 * band exists; otherwise null.
 */
export function estimateFee(
  t: Pick<TermsValues, "feeBasis" | "rateBps" | "flatFeeMinor" | "minFeeMinor">,
  job: { shareSalary: boolean; salaryMin: number | null; salaryMax: number | null },
): number | null {
  // Fails closed like SQL (QA-N2-07, QA-N2-09): anything outside (0, MAX_FEE_MINOR] is no estimate (never "~CAD 0").
  const bounded = (v: bigint | number | null) => (v === null || v <= 0 || v > MAX_FEE_MINOR ? null : Number(v));
  if (t.feeBasis === "flat") return bounded(t.flatFeeMinor);
  if (!job.shareSalary || (job.salaryMin === null && job.salaryMax === null) || t.rateBps === null) return null;
  const lo = BigInt(job.salaryMin ?? job.salaryMax!);
  const hi = BigInt(job.salaryMax ?? job.salaryMin!);
  const fee = divHalfUp((lo + hi) * BigInt(t.rateBps), 20000n);
  const min = BigInt(t.minFeeMinor ?? 0);
  return bounded(fee > min ? fee : min);
}

/** True when two cards differ on any T1–T9 value (BR-5: only then is a new version published). */
export function termsDiffer(a: TermsValues | null, b: TermsValues): boolean {
  if (!a) return true;
  return (
    a.feeBasis !== b.feeBasis ||
    a.rateBps !== b.rateBps ||
    a.flatFeeMinor !== b.flatFeeMinor ||
    a.minFeeMinor !== b.minFeeMinor ||
    a.currency !== b.currency ||
    a.searchType !== b.searchType ||
    a.guaranteeDays !== b.guaranteeDays ||
    a.guaranteeRemedy !== b.guaranteeRemedy ||
    a.paymentTermsDays !== b.paymentTermsDays ||
    a.ownershipMonths !== b.ownershipMonths
  );
}

export const FEE_DIFFERENCE_REASONS = ["client_discount", "client_contract_rate", "client_invoiced_other_currency", "invoice_correction", "non_permanent_engagement", "other"] as const;
export type FeeDifferenceReason = (typeof FEE_DIFFERENCE_REASONS)[number];

/**
 * BR-22 computed fee C, identical to SQL app.compute_fee: flat → the frozen amount; % bases →
 * round half-up(rate × (base + target bonus)), at least the minimum fee. Null when the base is missing.
 */
export function computeFee(
  t: Pick<TermsValues, "feeBasis" | "rateBps" | "flatFeeMinor" | "minFeeMinor">,
  reported: { baseMinor: number | null; bonusMinor?: number | null },
): number | null {
  if (t.feeBasis === "flat") return t.flatFeeMinor;
  if (reported.baseMinor === null || t.rateBps === null) return null;
  const amount = BigInt(reported.baseMinor) + BigInt(reported.bonusMinor ?? 0);
  const fee = divHalfUp(amount * BigInt(t.rateBps), 10000n);
  const min = BigInt(t.minFeeMinor ?? 0);
  return Number(fee > min ? fee : min);
}
