import Link from "next/link";
import { Clock, HandCoins } from "lucide-react";
import { feePendingEstimate, getPlacementSignals } from "@/features/commissions/placement-signals";
import { getRequestContext } from "@/server/auth/context";
import { StatusPill } from "@/components/shared/status-pill";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Panel } from "@/components/shared/card";
import { StatTile } from "@/components/shared/stat-tile";
import { listPlacements } from "@/features/commissions/queries";
import { ledgerBalances, projectedSplit, summarizeForOrg, type LedgerEntry } from "@/features/commissions/domain";
import { PLACEMENT_STATUS } from "@/lib/labels";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("commissions"))("title") };
}

export default async function CommissionsPage({ params }: PageProps<"/workspace/[orgSlug]/commissions">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
  const [placements, signals, t, tg, f] = await Promise.all([listPlacements(ctx), getPlacementSignals(ctx), getT("commissions"), getGlobalT(), getFormatter()]);
  const cur = ctx.currency;
  // Commission position across placements, in the organization's currency (never converted).
  const commissions = summarizeForOrg(placements as never, ctx.organizationId, cur);
  const rows = placements.map((p) => {
    const side = p.source_org_id === ctx.organizationId ? "source" : "target";
    const b = ledgerBalances((p.ledger ?? []) as LedgerEntry[]);
    // N2 (BR-27): pass C so the projection is floored at the computed fee (the job owner can go below 0).
    const proj = p.agreement ? projectedSplit(p.contracted_fee_minor, p.agreement, p.computed_fee_minor) : null;
    const share = side === "source" ? (b.received ? b.sourcingAllocated : proj?.sourcing) : (b.received ? b.jobOwnerAllocated : proj?.jobOwner);
    // N3: fee-pending rows show no amount, only the frozen estimate (BR-31); invoice overdue is BR-14.
    const signal = signals.get(p.id);
    const pending = p.status === "fee_pending" ? feePendingEstimate(signal?.terms ?? null, t, f) : null;
    return { p, side, share, projected: !b.received, pending, invoiceOverdue: !!signal?.invoiceOverdue };
  });

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {rows.length === 0 ? (
        <EmptyState icon={HandCoins} title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label={t("kpi.projected")} hint={t("kpi.projectedHint")} value={f.money(commissions.projected, cur, { code: true })} />
            <StatTile label={t("kpi.payable")} hint={t("kpi.payableHint")} value={f.money(commissions.payable, cur, { code: true })} />
            <StatTile label={t("kpi.paid")} hint={t("kpi.paidHint")} value={f.money(commissions.paid, cur, { code: true })} />
            <StatTile label={t("kpi.owed")} hint={t("kpi.owedHint")} value={f.money(commissions.owed, cur, { code: true })} />
          </div>
          <Panel className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <caption className="sr-only">{t("table.caption")}</caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-medium">{t("table.placement")}</th>
                    <th scope="col" className="px-5 py-3 font-medium">{t("table.role")}</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">{t("table.fee")}</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">{t("table.share")}</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">{t("table.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, side, share, projected, pending, invoiceOverdue }) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-3.5">
                        <Link href={`/workspace/${orgSlug}/commissions/${p.id}`} className="font-medium underline-offset-4 hover:underline">{p.referral?.job_title_snapshot}</Link>
                        <p className="text-xs text-muted-foreground">{p.referral?.candidate_label} · {f.date(p.start_date)}</p>
                      </td>
                      <td className="px-5 py-3.5">{side === "source" ? t("party.sourcing") : t("party.job_owner")}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {f.money(p.contracted_fee_minor, p.currency ?? "", { code: true })}
                        {pending ? <span className="block text-xs whitespace-normal text-muted-foreground">{pending.text}</span> : null}
                        {p.computed_fee_minor !== null && p.computed_fee_minor !== p.contracted_fee_minor ? (
                          <span className="block text-xs whitespace-normal text-muted-foreground">{t("table.computedSub", { amount: f.money(p.computed_fee_minor, p.currency ?? "", { code: true }) })}</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {f.money(share ?? null, p.currency ?? "", { code: true })}
                        {projected ? <span className="block text-xs text-muted-foreground">{t("table.projected")}</span> : null}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {/* Chips wrap to two lines in fr, never truncated (spec §5.10). */}
                        <div className="flex flex-col items-end gap-1.5">
                          <StatusPill tone={PLACEMENT_STATUS[p.status].tone} icon={p.status === "fee_pending" ? Clock : undefined} label={tg(`labels.placementStatus.${p.status}`)} wrap className="max-w-48 text-left" />
                          {invoiceOverdue ? <StatusPill tone="warning" icon={Clock} label={t("invoiceOverdue")} wrap className="max-w-48 text-left" /> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
