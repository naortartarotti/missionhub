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
import { PLACEMENT_STATUS } from "@/lib/labels";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("commissions"))("title") };
}

export default async function CommissionsPage({ params }: PageProps<"/w/[orgSlug]/commissions">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  const [placements, t, tg, f] = await Promise.all([listPlacements(ctx), getT("commissions"), getGlobalT(), getFormatter()]);
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
        title={t("title")}
        description={t("description")}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={t("kpi.projected")} hint={t("kpi.projectedHint")} value={f.money(projected, cur)} tone="lilac" icon={Hourglass} />
        <KpiTile label={t("kpi.payable")} hint={t("kpi.payableHint")} value={f.money(payable, cur)} tone="yellow" icon={Clock} />
        <KpiTile label={t("kpi.paid")} hint={t("kpi.paidHint")} value={f.money(paid, cur)} tone="green" icon={CircleDollarSign} />
        <KpiTile label={t("kpi.owed")} hint={t("kpi.owedHint")} value={f.money(owed, cur)} tone="blue" icon={Wallet} />
      </div>
      {placements.some((p) => p.currency !== cur) ? <p className="text-xs text-muted-foreground">{t("otherCurrencies", { currency: cur })}</p> : null}
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title={t("empty.title")} description={t("empty.description")} />
      ) : (
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
                  <th scope="col" className="px-5 py-3 font-medium">{t("table.start")}</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">{t("table.status")}</th>
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
                      <td className="px-5 py-3.5">{side === "source" ? t("party.sourcing") : t("party.job_owner")}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">{f.money(p.contracted_fee_minor, p.currency)}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {f.money(share ?? null, p.currency)}
                        {!b.received ? <span className="block text-xs text-muted-foreground">{t("table.projected")}</span> : null}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{f.date(p.start_date)}</td>
                      <td className="px-5 py-3.5 text-right"><StatusPill tone={st.tone} label={tg(`labels.placementStatus.${p.status}`)} /></td>
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
