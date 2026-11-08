import Link from "next/link";
import { CircleDollarSign, Clock, Hourglass, Wallet } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { listPlacements } from "@/features/commissions/queries";
import { ledgerBalances, projectedSplit, summarizeForOrg, type LedgerEntry } from "@/features/commissions/domain";
import { PageHeader } from "@/components/shared/page-header";
import { KpiTile } from "@/components/shared/kpi-tile";
import { EmptyState } from "@/components/shared/empty-state";
import { Panel } from "@/components/shared/card";
import { StatusPill } from "@/components/shared/status-pill";
import { PLACEMENT_STATUS, formatDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money/format";

export const metadata = { title: "Commissions" };

export default async function CommissionsPage({ params }: PageProps<"/w/[orgSlug]/commissions">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  const placements = await listPlacements(ctx);
  const cur = ctx.currency;

  const { projected, payable, paid, owed } = summarizeForOrg(placements as never, ctx.organizationId, cur);
  const rows = placements.map((p) => ({
    p,
    side: p.source_org_id === ctx.organizationId ? "source" : "target",
    b: ledgerBalances((p.ledger ?? []) as LedgerEntry[]),
    proj: p.agreement ? projectedSplit(p.contracted_fee_minor, p.agreement) : null,
  }));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Commissions"
        description="Projected amounts are estimates. Money becomes payable only after the client payment is verified, and paid only after the payout is verified. No funds move through MissionHub."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Projected" hint="Hires not yet paid by client" value={formatMoney(projected, cur)} tone="lilac" icon={Hourglass} />
        <KpiTile label="Payable to you" hint="Verified, awaiting payout" value={formatMoney(payable, cur)} tone="yellow" icon={Clock} />
        <KpiTile label="Paid to you" hint="Verified payouts" value={formatMoney(paid, cur)} tone="green" icon={CircleDollarSign} />
        <KpiTile label="You owe partners" hint="Verified shares to remit" value={formatMoney(owed, cur)} tone="blue" icon={Wallet} />
      </div>
      {placements.some((p) => p.currency !== cur) ? <p className="text-xs text-muted-foreground">Totals include only {cur} placements; other currencies are listed below and never converted.</p> : null}
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No placements yet" description="When a referral results in a hire, the placement and its commission ledger appear here." />
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Placements</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">Placement</th>
                  <th scope="col" className="px-5 py-3 font-medium">Your role</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Fee</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Your share</th>
                  <th scope="col" className="px-5 py-3 font-medium">Start</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, side, b, proj }) => {
                  const st = PLACEMENT_STATUS[p.status];
                  const share = side === "source" ? (b.received ? b.sourcingAllocated : proj?.sourcing) : (b.received ? b.jobOwnerAllocated : proj?.jobOwner);
                  return (
                    <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-3.5">
                        <Link href={`/w/${orgSlug}/commissions/${p.id}`} className="font-medium underline-offset-4 hover:underline">{p.referral?.job_title_snapshot}</Link>
                        <p className="text-xs text-muted-foreground">{p.referral?.candidate_label}</p>
                      </td>
                      <td className="px-5 py-3.5">{side === "source" ? "Sourcing recruiter" : "Job owner"}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">{formatMoney(p.contracted_fee_minor, p.currency)}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {formatMoney(share ?? null, p.currency)}
                        {!b.received ? <span className="block text-xs text-muted-foreground">projected</span> : null}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{formatDate(p.start_date)}</td>
                      <td className="px-5 py-3.5 text-right"><StatusPill tone={st.tone} label={st.label} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
