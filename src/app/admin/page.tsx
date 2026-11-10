import Link from "next/link";
import { AlertTriangle, Building2, FileCheck2, Handshake } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { requireUser } from "@/server/auth/context";
import { KpiTile } from "@/components/shared/kpi-tile";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { ReviewEvidenceButtons } from "@/features/commissions/components/finance-forms";
import { DisputeResolution, RuleForm, SuspendButton } from "@/features/admin/components/admin-controls";
import { Button } from "@/components/ui/button";
import { bpsToPercent } from "@/lib/money/format";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export default async function AdminPage() {
  const user = await requireUser();
  const [db, t, tg, f] = await Promise.all([createClient(), getT("admin"), getGlobalT(), getFormatter()]);
  const [metrics, orgs, evidence, disputes, rules, platformLedger] = await Promise.all([
    db.rpc("platform_metrics"),
    db.from("organizations").select("id, name, slug, kind, is_demo, suspended_at, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("payment_evidence").select("id, kind, amount_minor, processing_fee_minor, currency, occurred_on, reference, recorded_by, placement:placements(id, referral:referrals(job_title_snapshot))").eq("status", "pending").in("kind", ["client_payment", "client_refund", "platform_remittance"]).order("created_at"),
    db.from("disputes").select("id, reason, created_at, placement_id, org:organizations!disputes_opened_by_org_fkey(name)").eq("status", "open").order("created_at"),
    db.from("commission_rules").select("*").order("created_at", { ascending: false }),
    db.from("commission_ledger_entries").select("amount_minor, currency, entry_type").eq("party", "platform"),
  ]);
  const m = metrics.data?.[0];
  const revenue = new Map<string, { earned: number; outstanding: number }>();
  for (const e of platformLedger.data ?? []) {
    const r = revenue.get(e.currency) ?? { earned: 0, outstanding: 0 };
    if (e.entry_type === "allocation" || e.entry_type === "allocation_reversal") r.earned += e.amount_minor;
    r.outstanding += e.amount_minor;
    revenue.set(e.currency, r);
  }
  const current = (rules.data ?? []).find((r) => r.is_default);

  return (
    <div className="grid gap-8">
      <PageHeader title={t("page.title")} description={t("page.description")} actions={<Button variant="outline" asChild><Link href="/admin/wallets">{t("wallets.link")}</Link></Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={t("kpi.organizations")} hint={t("kpi.excludingDemo")} value={String(m?.organizations ?? 0)} tone="yellow" icon={Building2} />
        <KpiTile label={t("kpi.placements")} value={String(m?.placements ?? 0)} tone="blue" icon={Handshake} />
        <KpiTile label={t("kpi.evidence")} value={String(evidence.data?.length ?? 0)} tone="lilac" icon={FileCheck2} />
        <KpiTile label={t("kpi.disputes")} value={String(m?.open_disputes ?? 0)} tone="green" icon={AlertTriangle} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <SectionTitle>{t("evidence.title")}</SectionTitle>
          {(evidence.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("evidence.empty")}</p> : (
            <ul className="grid gap-3">
              {evidence.data!.map((e) => (
                <li key={e.id} className="rounded-2xl border border-border p-4 text-sm">
                  <p className="font-medium">{tg(`labels.evidenceKind.${e.kind}`)} · {f.money(e.amount_minor, e.currency)}</p>
                  <p className="text-muted-foreground">{e.placement?.referral?.job_title_snapshot} · {f.date(e.occurred_on)} · {t("evidence.ref", { reference: e.reference ?? "" })}{e.processing_fee_minor ? ` · ${t("evidence.fees", { amount: f.money(e.processing_fee_minor, e.currency) })}` : ""}</p>
                  <div className="mt-3">{e.recorded_by === user.id ? <p className="text-xs text-muted-foreground">{t("evidence.ownRecord")}</p> : <ReviewEvidenceButtons evidenceId={e.id} />}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <SectionTitle>{t("disputes.title")}</SectionTitle>
          {(disputes.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("disputes.empty")}</p> : (
            <ul className="grid gap-3">
              {disputes.data!.map((d) => (
                <li key={d.id} className="rounded-2xl border border-border p-4 text-sm">
                  <p className="font-medium">{t("disputes.openedBy", { org: d.org?.name ?? "", date: f.date(d.created_at) })}</p>
                  <p className="mt-1 text-muted-foreground">“{d.reason}”</p>
                  <div className="mt-3"><DisputeResolution disputeId={d.id} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <SectionTitle>{t("revenue.title")}</SectionTitle>
          {revenue.size === 0 ? <p className="text-sm text-muted-foreground">{t("revenue.empty")}</p> : (
            <ul className="grid gap-2 text-sm">
              {[...revenue.entries()].map(([cur, r]) => (
                <li key={cur} className="flex justify-between"><span>{cur}</span><span className="tabular-nums">{t("revenue.line", { earned: f.money(r.earned, cur), outstanding: f.money(r.outstanding, cur) })}</span></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <SectionTitle>{t("rules.title")}</SectionTitle>
          {current ? <p className="mb-4 text-sm text-muted-foreground">{t("rules.current", { version: String(current.version), sourcing: bpsToPercent(current.sourcing_bps), jobOwner: bpsToPercent(current.job_owner_bps), platform: bpsToPercent(current.platform_bps) })}</p> : null}
          <RuleForm current={{ sourcing: (current?.sourcing_bps ?? 4500) / 100, jobOwner: (current?.job_owner_bps ?? 4500) / 100, platform: (current?.platform_bps ?? 1000) / 100 }} />
          <ul className="mt-4 grid gap-1 text-xs text-muted-foreground">
            {(rules.data ?? []).map((r) => <li key={r.id}>v{r.version} · {bpsToPercent(r.sourcing_bps)}/{bpsToPercent(r.job_owner_bps)}/{bpsToPercent(r.platform_bps)} · {f.date(r.effective_from)}{r.retired_at ? ` → ${f.date(r.retired_at)}` : ` ${t("rules.currentTag")}`}</li>)}
          </ul>
        </Panel>
      </div>

      <Panel className="overflow-x-auto p-0">
        <div className="px-5 pt-5"><SectionTitle>{t("orgs.title")}</SectionTitle></div>
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">{t("orgs.title")}</caption>
          <thead><tr className="border-b border-border text-left text-muted-foreground"><th scope="col" className="px-5 py-3 font-medium">{t("orgs.name")}</th><th scope="col" className="px-5 py-3 font-medium">{t("orgs.type")}</th><th scope="col" className="px-5 py-3 font-medium">{t("orgs.created")}</th><th scope="col" className="px-5 py-3 font-medium">{t("orgs.status")}</th><th scope="col" className="px-5 py-3"><span className="sr-only">{t("orgs.actions")}</span></th></tr></thead>
          <tbody>
            {(orgs.data ?? []).map((o) => (
              <tr key={o.id} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-3 font-medium">{o.name}{o.is_demo ? <span className="ml-2 rounded-full bg-tile-yellow px-1.5 text-[10px] font-semibold text-tile-foreground">{t("orgs.demo")}</span> : null}</td>
                <td className="px-5 py-3 capitalize text-muted-foreground">{t(`orgs.kind.${o.kind}`)}</td>
                <td className="px-5 py-3 text-muted-foreground">{f.date(o.created_at)}</td>
                <td className="px-5 py-3">{o.suspended_at ? <StatusPill tone="danger" label={t("orgs.suspended")} /> : <StatusPill tone="success" label={t("orgs.active")} />}</td>
                <td className="px-5 py-3 text-right"><SuspendButton orgId={o.id} suspended={Boolean(o.suspended_at)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
