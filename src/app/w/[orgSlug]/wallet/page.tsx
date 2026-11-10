import Link from "next/link";
import { CircleDollarSign, Hourglass, Snowflake, Wallet } from "lucide-react";
import { can, getRequestContext } from "@/server/auth/context";
import { integrations } from "@/server/env";
import { getPayoutState, getWalletBalances, getWalletFreeze, listWalletEntries, WALLET_PAGE_SIZE } from "@/features/wallet/queries";
import { CashoutForm, PayoutSetupButton } from "@/features/wallet/components/wallet-actions";
import { StatusPill } from "@/components/shared/status-pill";
import { PageHeader } from "@/components/shared/page-header";
import { KpiTile } from "@/components/shared/kpi-tile";
import { EmptyState } from "@/components/shared/empty-state";
import { Panel } from "@/components/shared/card";
import { StatTile } from "@/components/shared/stat-tile";
import { listPlacements } from "@/features/commissions/queries";
import { ledgerBalances, projectedSplit, summarizeForOrg, type LedgerEntry } from "@/features/commissions/domain";
import { PLACEMENT_STATUS } from "@/lib/labels";
import { Pagination } from "@/components/shared/pagination";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("wallet"))("title") };
}

export default async function WalletPage({ params, searchParams }: PageProps<"/w/[orgSlug]/wallet">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Math.trunc(Number(sp.page)) || 1);
  const ctx = await getRequestContext(orgSlug);
  const [balances, { entries, total }, freeze, payouts, placements, t, tc, tg, f] = await Promise.all([
    getWalletBalances(ctx), listWalletEntries(ctx, page), getWalletFreeze(ctx), getPayoutState(ctx), listPlacements(ctx),
    getT("wallet"), getT("commissions"), getGlobalT(), getFormatter(),
  ]);
  // The withdrawals panel only exists once a payment provider is connected, and only for those who may move money.
  const showPayouts = integrations.payments && can(ctx, "wallet:cashout");
  const cur = ctx.currency;
  const main = balances.find((b) => b.currency === cur) ?? { currency: cur, available: 0, pending: 0 };
  const others = balances.filter((b) => b.currency !== cur && (b.available !== 0 || b.pending !== 0));
  // Commission position across placements. "Paid to you" is left out: it is what the balance and activity already show.
  const commissions = summarizeForOrg(placements as never, ctx.organizationId, cur);
  const rows = placements.map((p) => {
    const side = p.source_org_id === ctx.organizationId ? "source" : "target";
    const b = ledgerBalances((p.ledger ?? []) as LedgerEntry[]);
    const proj = p.agreement ? projectedSplit(p.contracted_fee_minor, p.agreement) : null;
    const share = side === "source" ? (b.received ? b.sourcingAllocated : proj?.sourcing) : (b.received ? b.jobOwnerAllocated : proj?.jobOwner);
    return { p, side, share, projected: !b.received };
  });

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {freeze ? (
        <Alert>
          <Snowflake aria-hidden />
          <AlertTitle>{t("frozen.title")}</AlertTitle>
          <AlertDescription>{t("frozen.description")}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiTile label={t("kpi.available")} hint={t("kpi.availableHint")} value={f.money(main.available, cur)} tone="green" icon={CircleDollarSign} />
        <KpiTile label={t("kpi.pending")} hint={t("kpi.pendingHint")} value={f.money(main.pending, cur)} tone="yellow" icon={Hourglass} />
      </div>
      {others.length > 0 ? (
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t("otherCurrencies")}</p>
          <ul className="mt-1 grid gap-0.5">
            {others.map((b) => (
              <li key={b.currency} className="tabular-nums">
                {t("otherCurrencyLine", { currency: b.currency, available: f.money(b.available, b.currency), pending: f.money(b.pending, b.currency) })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {placements.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label={tc("kpi.projected")} hint={tc("kpi.projectedHint")} value={f.money(commissions.projected, cur)} />
          <StatTile label={tc("kpi.payable")} hint={tc("kpi.payableHint")} value={f.money(commissions.payable, cur)} />
          <StatTile label={tc("kpi.owed")} hint={tc("kpi.owedHint")} value={f.money(commissions.owed, cur)} />
        </div>
      ) : null}
      {showPayouts ? (
        <Panel className="grid gap-4">
          <h2 className="text-base font-semibold">{t("payouts.title")}</h2>
          {!payouts.destination ? (
            <>
              <p className="max-w-prose text-sm text-muted-foreground">{t("payouts.notSetUp")}</p>
              <div><PayoutSetupButton orgSlug={orgSlug} label={t("payouts.setUp")} /></div>
            </>
          ) : !payouts.destination.payouts_enabled ? (
            <>
              <StatusPill tone="warning" label={t("payouts.incomplete")} />
              <div><PayoutSetupButton orgSlug={orgSlug} label={t("payouts.continue")} /></div>
            </>
          ) : (
            <>
              <StatusPill tone="success" label={t("payouts.ready")} />
              {payouts.cashoutsEnabled && !freeze ? (
                <CashoutForm orgSlug={orgSlug} currency={cur} availableLabel={t("payouts.availableHint", { amount: f.money(main.available, cur) })} />
              ) : !payouts.cashoutsEnabled ? (
                <p className="text-sm text-muted-foreground">{t("payouts.disabled")}</p>
              ) : null}
            </>
          )}
          {payouts.cashouts.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium">{t("payouts.history")}</h3>
              <ul className="mt-2 grid gap-1.5 text-sm">
                {payouts.cashouts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">{f.date(c.created_at)}</span>
                    <span className="tabular-nums">{f.money(c.amount_minor, c.currency)}</span>
                    <StatusPill tone={c.status === "paid" ? "success" : c.status === "failed" ? "danger" : "warning"} label={t(`payouts.status.${c.status}`)} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      ) : null}
      {rows.length > 0 ? (
        <Panel className="overflow-hidden p-0">
          <div className="px-5 pt-4 pb-2">
            <h2 className="text-base font-semibold">{t("placements.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("placements.description")}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">{tc("table.caption")}</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">{tc("table.placement")}</th>
                  <th scope="col" className="px-5 py-3 font-medium">{tc("table.role")}</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">{tc("table.fee")}</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">{tc("table.share")}</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">{tc("table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, side, share, projected }) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-3.5">
                      <Link href={`/w/${orgSlug}/wallet/placements/${p.id}`} className="font-medium underline-offset-4 hover:underline">{p.referral?.job_title_snapshot}</Link>
                      <p className="text-xs text-muted-foreground">{p.referral?.candidate_label} · {f.date(p.start_date)}</p>
                    </td>
                    <td className="px-5 py-3.5">{side === "source" ? tc("party.sourcing") : tc("party.job_owner")}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums">{f.money(p.contracted_fee_minor, p.currency)}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums">
                      {f.money(share ?? null, p.currency)}
                      {projected ? <span className="block text-xs text-muted-foreground">{tc("table.projected")}</span> : null}
                    </td>
                    <td className="px-5 py-3.5 text-right"><StatusPill tone={PLACEMENT_STATUS[p.status].tone} label={tg(`labels.placementStatus.${p.status}`)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      {total === 0 && rows.length === 0 ? (
        <EmptyState icon={Wallet} title={t("empty.title")} description={t("empty.description")} />
      ) : total === 0 ? null : (
        <>
          <Panel className="overflow-hidden p-0">
            <h2 className="px-5 pt-4 pb-2 text-base font-semibold">{t("statement.title")}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">{t("statement.caption")}</caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-medium">{t("statement.date")}</th>
                    <th scope="col" className="px-5 py-3 font-medium">{t("statement.description")}</th>
                    <th scope="col" className="px-5 py-3 font-medium">{t("statement.account")}</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">{t("statement.amount")}</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">{t("statement.balanceAfter")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const kind = e.transaction.kind === "transfer" ? (e.amount_minor > 0 ? "transfer_in" : "transfer_out") : e.transaction.kind;
                    const placement = e.transaction.placement;
                    const detail = placement?.referral?.job_title_snapshot ?? e.transaction.memo;
                    const currency = e.account.currency;
                    const account = e.account.kind === "pending" ? "pending" : "available";
                    return (
                      <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                        <td className="px-5 py-3.5 whitespace-nowrap text-muted-foreground">{f.date(e.created_at)}</td>
                        <td className="px-5 py-3.5">
                          <span className="font-medium">{t(`kind.${kind}`)}</span>
                          {detail ? (
                            <p className="text-xs text-muted-foreground">
                              {placement ? (
                                <Link href={`/w/${orgSlug}/wallet/placements/${placement.id}`} className="underline-offset-4 hover:underline">{detail}</Link>
                              ) : (
                                detail
                              )}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">{t(`account.${account}`)}</td>
                        <td className="px-5 py-3.5 text-right font-medium tabular-nums">
                          {e.amount_minor > 0 ? "+" : "−"}
                          {f.money(Math.abs(e.amount_minor), currency)}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-muted-foreground">{f.money(e.balance_after_minor, currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
          <Pagination base={`/w/${orgSlug}/wallet`} params={{}} page={page} total={total} pageSize={WALLET_PAGE_SIZE} />
        </>
      )}
    </div>
  );
}
