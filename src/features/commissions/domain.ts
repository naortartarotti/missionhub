import { splitCommission } from "@/lib/money/allocate";

export type LedgerEntry = { party: "job_owner" | "sourcing" | "platform" | "client"; entry_type: string; amount_minor: number };

/** Balances derived purely from immutable ledger entries. */
export function ledgerBalances(entries: LedgerEntry[]) {
  const sum = (pred: (e: LedgerEntry) => boolean) => entries.filter(pred).reduce((a, e) => a + e.amount_minor, 0);
  return {
    received: sum((e) => e.party === "client"),
    sourcingAllocated: sum((e) => e.party === "sourcing" && (e.entry_type === "allocation" || e.entry_type === "allocation_reversal")),
    sourcingPaid: -sum((e) => e.party === "sourcing" && e.entry_type === "payout"),
    sourcingOutstanding: sum((e) => e.party === "sourcing"),
    platformAllocated: sum((e) => e.party === "platform" && (e.entry_type === "allocation" || e.entry_type === "allocation_reversal")),
    platformOutstanding: sum((e) => e.party === "platform"),
    jobOwnerAllocated: sum((e) => e.party === "job_owner"),
  };
}

/** Projection only — never displayed as settled cash. */
export function projectedSplit(feeMinor: number, bps: { sourcing_bps: number; job_owner_bps: number; platform_bps: number }) {
  const s = splitCommission(feeMinor, { sourcingBps: bps.sourcing_bps, jobOwnerBps: bps.job_owner_bps, platformBps: bps.platform_bps });
  return { sourcing: Number(s.sourcing), jobOwner: Number(s.jobOwner), platform: Number(s.platform) };
}
