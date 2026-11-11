import { CircleDollarSign, Landmark, ShieldCheck, Snowflake } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { integrations } from "@/server/env";
import { listStuckCashouts } from "@/features/admin/wallet-queries";
import { KpiTile } from "@/components/shared/kpi-tile";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { WalletCashoutsSwitch, WalletFreezeButton, WalletTransfersSwitch } from "@/features/admin/components/admin-controls";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("admin"))("wallets.title") };
}

type Totals = { available: number; pending: number; revenue: number; clearing: number };

// Access is gated by the admin layout (404 for non-admins); RLS and the RPCs re-check platform admin.
export default async function AdminWalletsPage() {
  const [db, t, f] = await Promise.all([createClient(), getT("admin"), getFormatter()]);
  const [accounts, orgs, freezes, settings, reconcile, recent, flaggedCharges, openCashouts] = await Promise.all([
    db.from("wallet_accounts").select("organization_id, kind, currency, balance_minor"),
    db.from("organizations").select("id, name, is_demo, default_currency").order("name").limit(200),
    db.from("wallet_freezes").select("organization_id, reason, frozen_at"),
    db.from("wallet_settings").select("transfers_enabled, cashouts_enabled").single(),
    db.rpc("wallet_reconcile"),
    db
      .from("wallet_transactions")
      .select("id, kind, currency, amount_minor, created_at, entries:wallet_entries(account:wallet_accounts(organization:organizations(name)))")
      .order("created_at", { ascending: false })
      .limit(20),
    db.from("placement_charges").select("id, amount_minor, currency, status, review_reason").in("status", ["review", "disputed", "refunded"]).order("created_at", { ascending: false }).limit(50),
    listStuckCashouts(db),
  ]);
  for (const r of [accounts, orgs, freezes, settings, recent, flaggedCharges, openCashouts]) if (r.error) throw r.error;

  const totals = new Map<string, Totals>();
  const byOrg = new Map<string, Map<string, { available: number; pending: number }>>();
  for (const a of accounts.data ?? []) {
    const tot = totals.get(a.currency) ?? { available: 0, pending: 0, revenue: 0, clearing: 0 };
    if (a.kind === "available") tot.available += a.balance_minor;
    else if (a.kind === "pending") tot.pending += a.balance_minor;
    else if (a.kind === "platform_revenue") tot.revenue += a.balance_minor;
    else if (a.kind === "psp_clearing") tot.clearing += a.balance_minor;
    totals.set(a.currency, tot);
    if (a.organization_id && (a.kind === "available" || a.kind === "pending")) {
      const cur = byOrg.get(a.organization_id) ?? new Map();
      const b = cur.get(a.currency) ?? { available: 0, pending: 0 };
      b[a.kind] = a.balance_minor;
      cur.set(a.currency, b);
      byOrg.set(a.organization_id, cur);
    }
  }
  const currencies = [...totals.keys()].sort();
  const mainCurrency = currencies.includes("CAD") ? "CAD" : (currencies[0] ?? "CAD");
  const main = totals.get(mainCurrency) ?? { available: 0, pending: 0, revenue: 0, clearing: 0 };
  const frozen = new Map((freezes.data ?? []).map((x) => [x.organization_id, x]));
  const issues = reconcile.data ?? [];
  const checkAvailable = !reconcile.error;
  const healthy = checkAvailable && issues.length === 0;
  const transfersEnabled = settings.data?.transfers_enabled ?? false;
  const cashoutsEnabled = settings.data?.cashouts_enabled ?? false;
  const attention = (flaggedCharges.data?.length ?? 0) + (openCashouts.data?.length ?? 0);
  // Organizations that hold a balance or are frozen first; the rest stay alphabetical.
  const rank = (id: string) => (frozen.has(id) ? 0 : byOrg.has(id) ? 1 : 2);
  const orgRows = [...(orgs.data ?? [])].sort((a, b) => rank(a.id) - rank(b.id));

  return (
    <div className="grid gap-8">
      <PageHeader
        title={t("wallets.title")}
        description={t("wallets.description")}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={t("wallets.kpi.held")} hint={t("wallets.kpi.heldHint", { currency: mainCurrency })} value={f.money(main.available + main.pending, mainCurrency)} tone="green" icon={Landmark} />
        <KpiTile label={t("wallets.kpi.revenue")} hint={t("wallets.kpi.revenueHint")} value={f.money(main.revenue, mainCurrency)} tone="blue" icon={CircleDollarSign} />
        <KpiTile label={t("wallets.kpi.frozen")} value={String(frozen.size)} tone="lilac" icon={Snowflake} />
        <KpiTile label={t("wallets.kpi.ledger")} value={!checkAvailable ? "—" : healthy ? t("wallets.kpi.ledgerOk") : t("wallets.kpi.ledgerBad", { count: issues.length })} tone="yellow" icon={ShieldCheck} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <SectionTitle>{t("wallets.health.title")}</SectionTitle>
          {!checkAvailable ? (
            <p className="text-sm text-muted-foreground">{t("wallets.health.unavailable")}</p>
          ) : healthy ? (
            <StatusPill tone="success" label={t("wallets.health.ok")} wrap />
          ) : (
            <div role="alert" className="grid gap-2 text-sm">
              <StatusPill tone="danger" label={t("wallets.health.bad")} wrap />
              <ul className="grid gap-1 text-muted-foreground">
                {issues.map((i, n) => (
                  <li key={i.account_id ?? `book-${n}`} className="tabular-nums">
                    {i.account_id
                      ? t("wallets.health.account", { id: i.account_id.slice(0, 8), cached: String(i.cached_minor), computed: String(i.computed_minor) })
                      : t("wallets.health.book", { computed: String(i.computed_minor) })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t("wallets.health.note")}</p>
        </Panel>
        <Panel>
          <SectionTitle>{t("wallets.attention.title")}</SectionTitle>
          <StatusPill tone={integrations.payments ? "success" : "warning"} label={integrations.payments ? t("wallets.provider.connected") : t("wallets.provider.missing")} wrap />
          {attention === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t("wallets.attention.empty")}</p> : (
            <ul className="mt-3 grid gap-3 text-sm">
              {(flaggedCharges.data ?? []).map((c) => (
                <li key={c.id} className="rounded-2xl border border-border p-4">
                  <p className="font-medium">{t("wallets.attention.charge", { amount: f.money(c.amount_minor, c.currency), status: t(`wallets.attention.chargeStatus.${c.status as "review" | "disputed" | "refunded"}`) })}</p>
                  <p className="mt-1 text-muted-foreground">{t("wallets.attention.chargeReason", { reason: c.review_reason ?? c.status })}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{c.id}</p>
                </li>
              ))}
              {(openCashouts.data ?? []).map((c) => (
                <li key={c.id} className="rounded-2xl border border-border p-4">
                  <p className="font-medium">{t("wallets.attention.cashout", { amount: f.money(c.amount_minor, c.currency), org: c.organization?.name ?? "", date: f.date(c.created_at) })}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{c.id}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <SectionTitle action={<WalletTransfersSwitch enabled={transfersEnabled} />}>{t("wallets.transfers.title")}</SectionTitle>
          <StatusPill tone={transfersEnabled ? "warning" : "neutral"} label={transfersEnabled ? t("wallets.transfers.on") : t("wallets.transfers.off")} wrap />
        </Panel>
        <Panel>
          <SectionTitle action={<WalletCashoutsSwitch enabled={cashoutsEnabled} />}>{t("wallets.cashouts.title")}</SectionTitle>
          <StatusPill tone={cashoutsEnabled ? "warning" : "neutral"} label={cashoutsEnabled ? t("wallets.cashouts.on") : t("wallets.cashouts.off")} wrap />
        </Panel>
      </div>

      <Panel className="overflow-x-auto p-0">
        <div className="px-5 pt-5"><SectionTitle>{t("wallets.totals.title")}</SectionTitle></div>
        {currencies.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">{t("wallets.totals.empty")}</p> : (
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">{t("wallets.totals.title")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">{t("wallets.totals.currency")}</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">{t("wallets.totals.available")}</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">{t("wallets.totals.pending")}</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">{t("wallets.totals.revenue")}</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">{t("wallets.totals.provider")}</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map((c) => {
                const x = totals.get(c)!;
                return (
                  <tr key={c} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium">{c}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{f.money(x.available, c)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{f.money(x.pending, c)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{f.money(x.revenue, c)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{f.money(-x.clearing, c)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel className="overflow-x-auto p-0">
        <div className="px-5 pt-5"><SectionTitle>{t("wallets.orgs.title")}</SectionTitle></div>
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">{t("wallets.orgs.title")}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="px-5 py-3 font-medium">{t("wallets.orgs.name")}</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">{t("wallets.orgs.available")}</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">{t("wallets.orgs.pending")}</th>
              <th scope="col" className="px-5 py-3 font-medium">{t("wallets.orgs.status")}</th>
              <th scope="col" className="px-5 py-3"><span className="sr-only">{t("wallets.orgs.actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {orgRows.map((o) => {
              const balances = [...(byOrg.get(o.id)?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b));
              const freeze = frozen.get(o.id);
              return (
                <tr key={o.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="px-5 py-3 font-medium">{o.name}{o.is_demo ? <span className="ml-2 rounded-full bg-tile-yellow px-1.5 text-[10px] font-semibold text-tile-foreground">{t("orgs.demo")}</span> : null}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{balances.length ? balances.map(([c, b]) => <span key={c} className="block">{f.money(b.available, c)}</span>) : <span className="text-muted-foreground">{t("wallets.orgs.none")}</span>}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{balances.length ? balances.map(([c, b]) => <span key={c} className="block">{f.money(b.pending, c)}</span>) : <span className="text-muted-foreground">{t("wallets.orgs.none")}</span>}</td>
                  <td className="px-5 py-3">
                    {freeze ? (
                      <>
                        <StatusPill tone="danger" label={t("wallets.orgs.frozen")} />
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">{t("wallets.orgs.frozenSince", { date: f.date(freeze.frozen_at), reason: freeze.reason })}</p>
                      </>
                    ) : (
                      <StatusPill tone="success" label={t("wallets.orgs.active")} />
                    )}
                  </td>
                  <td className="px-5 py-3 text-right"><WalletFreezeButton orgId={o.id} frozen={Boolean(freeze)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel className="overflow-x-auto p-0">
        <div className="px-5 pt-5"><SectionTitle>{t("wallets.recent.title")}</SectionTitle></div>
        {(recent.data ?? []).length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">{t("wallets.recent.empty")}</p> : (
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">{t("wallets.recent.title")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">{t("wallets.recent.date")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("wallets.recent.kind")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("wallets.recent.parties")}</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">{t("wallets.recent.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {recent.data!.map((x) => {
                const parties = [...new Set(x.entries.map((e) => e.account?.organization?.name).filter((n): n is string => Boolean(n)))];
                return (
                  <tr key={x.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{f.date(x.created_at)}</td>
                    <td className="px-5 py-3 font-medium">{t(`wallets.kind.${x.kind}`)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{parties.length ? parties.join(" → ") : t("wallets.recent.system")}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{f.money(x.amount_minor, x.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
