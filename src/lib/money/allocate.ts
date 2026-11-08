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
