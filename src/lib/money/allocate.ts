/**
 * Deterministic largest-remainder allocation in integer minor units.
 * MUST stay identical to SQL `app.allocate_minor` (parity-tested in tests/integration).
 *  - shares are basis points and must total exactly 10,000
 *  - remainder units go to the largest fractional remainders; ties → earlier index
 *  - negative amounts (refunds/reversals) allocate the absolute value and negate
 */
export const TOTAL_BPS = 10_000;

export function allocateMinor(amountMinor: bigint | number, sharesBps: readonly number[]): bigint[] {
  const amount = BigInt(amountMinor);
  if (sharesBps.length === 0) throw new Error("At least one share is required");
  let total = 0;
  for (const s of sharesBps) {
    if (!Number.isInteger(s) || s < 0) throw new Error(`Invalid share: ${s}`);
    total += s;
  }
  if (total !== TOTAL_BPS) throw new Error(`Shares must total ${TOTAL_BPS} bps, got ${total}`);

  const sign = amount < 0n ? -1n : 1n;
  const abs = amount * sign;
  const base = sharesBps.map((s) => (abs * BigInt(s)) / BigInt(TOTAL_BPS));
  const rem = sharesBps.map((s) => (abs * BigInt(s)) % BigInt(TOTAL_BPS));
  let left = abs - base.reduce((a, b) => a + b, 0n);
  while (left > 0n) {
    let idx = 0;
    for (let i = 1; i < rem.length; i++) if (rem[i] > rem[idx]) idx = i;
    base[idx] += 1n;
    rem[idx] = -1n;
    left -= 1n;
  }
  return base.map((v) => v * sign);
}

export type CommissionSplit = { sourcingBps: number; jobOwnerBps: number; platformBps: number };

export const DEFAULT_SPLIT: CommissionSplit = { sourcingBps: 4500, jobOwnerBps: 4500, platformBps: 1000 };

export function splitCommission(distributableMinor: bigint | number, split: CommissionSplit) {
  const [sourcing, jobOwner, platform] = allocateMinor(distributableMinor, [
    split.sourcingBps,
    split.jobOwnerBps,
    split.platformBps,
  ]);
  return { sourcing, jobOwner, platform };
}

export type PlatformBasis = "collected" | "frozen";

/** Half-up integer division on non-negative bigints (SQL app.round_half_up). */
const roundHalfUp = (n: bigint, d: bigint) => (2n * n + d) / (2n * d);

/**
 * N2 BR-27 allocation of a net client payment (negative for a refund) P, identical to SQL
 * app.allocate_placement (parity-tested):
 *  - legacy (computed null) or I ≥ C → exactly allocateMinor(P, split);
 *  - I < C → sourcing = sourcing_bps × C × P / I; platform = platform_bps × P (`collected`) or
 *    platform_bps × C × P / I (`frozen`); job owner = P − both (may be negative). Half-up on |P|.
 */
export function allocatePlacement(
  amountMinor: bigint | number,
  split: CommissionSplit,
  fee: { computedMinor: bigint | number | null; invoicedMinor: bigint | number; platformBasis: PlatformBasis },
): { sourcing: bigint; jobOwner: bigint; platform: bigint } {
  const amount = BigInt(amountMinor);
  // Same rule as SQL (QA-N2-08): a net payment or refund above 10^12 minor units is refused on every path.
  if (amount > 1_000_000_000_000n || amount < -1_000_000_000_000n) throw new Error("invalid_fee");
  const invoiced = BigInt(fee.invoicedMinor);
  if (fee.computedMinor === null || invoiced >= BigInt(fee.computedMinor)) return splitCommission(amount, split);
  if (invoiced <= 0n) throw new Error("Invoiced fee must be positive");
  const computed = BigInt(fee.computedMinor);
  const sign = amount < 0n ? -1n : 1n;
  const abs = amount * sign;
  const s = roundHalfUp(abs * BigInt(split.sourcingBps) * computed, invoiced * 10_000n);
  const p =
    fee.platformBasis === "frozen"
      ? roundHalfUp(abs * BigInt(split.platformBps) * computed, invoiced * 10_000n)
      : roundHalfUp(abs * BigInt(split.platformBps), 10_000n);
  // Same range rule as SQL (QA-N2-02): results that don't fit a Postgres bigint are refused, not wrapped.
  const MAX = 9_223_372_036_854_775_807n;
  if (s > MAX || p > MAX || abs - s - p < -MAX) throw new Error("invalid_fee");
  return { sourcing: sign * s, jobOwner: sign * (abs - s - p), platform: sign * p };
}
