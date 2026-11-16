import { allocatePlacement, type PlatformBasis } from "@/lib/money/allocate";

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

type AgreementBps = { sourcing_bps: number; job_owner_bps: number; platform_bps: number; platform_basis?: PlatformBasis };

/**
 * Projection only — never displayed as settled cash. N2 (BR-27): the projected split of the invoiced fee I
 * (P = I). Pass the placement's computed fee C for snapshot placements: when I < C the sourcing share is on C
 * and the job-owner share can be negative. Without C (legacy placements) it's today's split.
 */
/** N3 (BR-31): a fee-pending placement has no fee yet, so there's no projection (MissionHub never invents a fee). */
export function projectedSplit(feeMinor: number | null, bps: AgreementBps, computedFeeMinor: number | null = null) {
  if (feeMinor === null) return null;
  const s = allocatePlacement(
    feeMinor,
    { sourcingBps: bps.sourcing_bps, jobOwnerBps: bps.job_owner_bps, platformBps: bps.platform_bps },
    { computedMinor: computedFeeMinor, invoicedMinor: feeMinor, platformBasis: bps.platform_basis ?? "collected" },
  );
  return { sourcing: Number(s.sourcing), jobOwner: Number(s.jobOwner), platform: Number(s.platform) };
}

type PlacementLike = {
  source_org_id: string;
  status: string;
  currency: string | null;
  contracted_fee_minor: number | null;
  computed_fee_minor?: number | null;
  agreement: AgreementBps | null;
  ledger: LedgerEntry[] | null;
};

/** Org-scoped commission totals in a single currency (other currencies are never converted). */
export function summarizeForOrg(placements: PlacementLike[], orgId: string, currency: string) {
  const totals = { projected: 0, payable: 0, paid: 0, owed: 0 };
  for (const p of placements) {
    if (p.currency !== currency) continue;
    const b = ledgerBalances(p.ledger ?? []);
    const proj = p.agreement ? projectedSplit(p.contracted_fee_minor, p.agreement, p.computed_fee_minor ?? null) : null;
    const unpaid = b.received === 0 && proj && p.status !== "cancelled";
    if (p.source_org_id === orgId) {
      if (unpaid) totals.projected += proj.sourcing;
      totals.payable += Math.max(0, b.sourcingOutstanding);
      totals.paid += b.sourcingPaid;
    } else {
      if (unpaid) totals.projected += proj.jobOwner;
      totals.owed += Math.max(0, b.sourcingOutstanding) + Math.max(0, b.platformOutstanding);
    }
  }
  return totals;
}
