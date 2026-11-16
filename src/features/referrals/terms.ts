import { splitCommission } from "@/lib/money/allocate";

export type FeeTerms = { fee_basis: string; rate_bps: number | null; flat_fee_minor: number | null; min_fee_minor: number | null; currency: string };

/**
 * A's expected share (BR-36, QA-N2-05), from the EFFECTIVE terms:
 * - effective flat → the exact share of the flat amount (amended or not);
 * - % terms unchanged on the fee (same basis, rate, minimum and currency as the snapshot) → the frozen
 *   estimate A was shown × the sourcing share (null when no estimate was shown);
 * - otherwise (an amendment changed the % fee terms, or switched flat → %) the frozen estimate no
 *   longer applies → null, and the UI shows jobs.terms.shareAtHire.* from shareBps + rateBps.
 */
export function expectedShare(
  snapshot: FeeTerms,
  effective: FeeTerms,
  feeEstimateMinor: number | null,
  rule: { sourcing_bps: number; job_owner_bps: number; platform_bps: number },
): number | null {
  const split = { sourcingBps: rule.sourcing_bps, jobOwnerBps: rule.job_owner_bps, platformBps: rule.platform_bps };
  if (effective.fee_basis === "flat") return effective.flat_fee_minor === null ? null : Number(splitCommission(effective.flat_fee_minor, split).sourcing);
  const sameFee =
    effective.fee_basis === snapshot.fee_basis && effective.rate_bps === snapshot.rate_bps &&
    effective.min_fee_minor === snapshot.min_fee_minor && effective.currency === snapshot.currency;
  if (!sameFee || feeEstimateMinor === null) return null;
  return Number(splitCommission(feeEstimateMinor, split).sourcing);
}
