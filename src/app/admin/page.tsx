import Link from "next/link";
import { AlertTriangle, ArrowRight, Briefcase, Building2, FileCheck2, Handshake, Send, Users, Wallet, type LucideIcon } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { KpiTile } from "@/components/shared/kpi-tile";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { daysAgo, getAdminQueues } from "@/features/admin/queries";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("admin"))("overview.title") };
}

// Access is gated by the admin layout (404 for non-admins); RLS and the RPCs re-check platform admin.
export default async function AdminOverviewPage() {
  const [db, t, f] = await Promise.all([createClient(), getT("admin"), getFormatter()]);
  const monthAgo = daysAgo(30);
  const [metrics, users, newOrgs, newUsers, queues, recentOrgs, audit, platformLedger] = await Promise.all([
    db.rpc("platform_metrics"),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("organizations").select("id", { count: "exact", head: true }).eq("is_demo", false).gte("created_at", monthAgo),
    db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", monthAgo),
    getAdminQueues(db),
    db.from("organizations").select("id, name, kind, is_demo, suspended_at, created_at, organization_memberships(count)").order("created_at", { ascending: false }).limit(6),
    db
      .from("audit_events")
      .select("id, action, entity_type, created_at, actor:profiles!audit_events_actor_profile_fk(full_name), organization:organizations(name)")
      .order("created_at", { ascending: false })
      .limit(8),
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

  const attention: { key: "evidence" | "disputes" | "wallets"; href: string; icon: LucideIcon; count: number }[] = [
    { key: "evidence", href: "/admin/evidence", icon: FileCheck2, count: queues.evidence },
    { key: "disputes", href: "/admin/disputes", icon: AlertTriangle, count: queues.disputes },
    { key: "wallets", href: "/admin/wallets", icon: Wallet, count: queues.wallets },
  ];
  const activity: { key: "activeJobs" | "activeCandidates" | "referrals"; icon: LucideIcon; value: number }[] = [
    { key: "activeJobs", icon: Briefcase, value: m?.active_jobs ?? 0 },
    { key: "activeCandidates", icon: Users, value: m?.active_candidates ?? 0 },
    { key: "referrals", icon: Send, value: m?.referrals ?? 0 },
  ];

  return (
    <div className="grid gap-8">
      <PageHeader title={t("overview.title")} description={t("overview.description")} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={t("kpi.organizations")} hint={t("kpi.newThisMonth", { count: String(newOrgs.count ?? 0) })} value={String(m?.organizations ?? 0)} tone="yellow" icon={Building2} href="/admin/organizations" />
        <KpiTile label={t("kpi.users")} hint={t("kpi.newThisMonth", { count: String(newUsers.count ?? 0) })} value={String(users.count ?? 0)} tone="lilac" icon={Users} href="/admin/users" />
        <KpiTile label={t("kpi.placements")} value={String(m?.placements ?? 0)} tone="blue" icon={Handshake} />
        <KpiTile label={t("kpi.attention")} hint={t("kpi.attentionHint")} value={String(queues.evidence + queues.disputes + queues.wallets)} tone="green" icon={AlertTriangle} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <SectionTitle>{t("overview.attention")}</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-3">
            {attention.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="group flex h-full flex-col justify-between gap-6 rounded-2xl border border-border p-4 transition-colors hover:bg-accent">
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-full bg-muted" aria-hidden>
                      <a.icon className="size-[18px]" />
                    </span>
                    {a.count ? <StatusPill tone="warning" label={t("overview.pending")} /> : <StatusPill tone="success" label={t("overview.clear")} />}
                  </div>
                  <div>
                    <p className="text-3xl font-semibold tracking-tight tabular-nums">{a.count}</p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
                      {t(`overview.queues.${a.key}`)} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <SectionTitle>{t("overview.marketplace")}</SectionTitle>
          <ul className="grid gap-3">
            {activity.map((a) => (
              <li key={a.key} className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-muted" aria-hidden>
                  <a.icon className="size-4" />
                </span>
                <span className="flex-1 text-sm text-muted-foreground">{t(`kpi.${a.key}`)}</span>
                <span className="text-lg font-semibold tabular-nums">{a.value}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">{t("overview.privacyNote")}</p>
        </Panel>

        <Panel>
          <SectionTitle action={<Link href="/admin/organizations" className="text-sm font-medium text-muted-foreground hover:text-foreground">{t("overview.seeAll")}</Link>}>{t("overview.newOrgs")}</SectionTitle>
          <ul className="grid gap-3">
            {(recentOrgs.data ?? []).map((o) => (
              <li key={o.id}>
                <Link href={`/admin/organizations/${o.id}`} className="flex items-center gap-3 rounded-xl hover:bg-accent/60">
                  <InitialsAvatar name={o.name} className="size-9 rounded-xl" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t("orgs.membersCount", { count: String(o.organization_memberships[0]?.count ?? 0) })} · {f.relative(o.created_at)}
                    </span>
                  </span>
                  {o.suspended_at ? <StatusPill tone="danger" label={t("orgs.suspended")} /> : o.is_demo ? <StatusPill tone="neutral" label={t("orgs.demo")} /> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="xl:col-span-2">
          <SectionTitle action={<Link href="/admin/audit" className="text-sm font-medium text-muted-foreground hover:text-foreground">{t("overview.seeAll")}</Link>}>{t("overview.recentActivity")}</SectionTitle>
          {(audit.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("audit.empty")}</p>
          ) : (
            <ul className="grid gap-2.5 text-sm">
              {audit.data!.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                  <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{e.action}</code>
                  <span className="text-muted-foreground">
                    {e.actor?.full_name || t("audit.system")}
                    {e.organization?.name ? ` · ${e.organization.name}` : ""}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">{f.relative(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="xl:col-span-3">
          <SectionTitle>{t("revenue.title")}</SectionTitle>
          {revenue.size === 0 ? (
            <p className="text-sm text-muted-foreground">{t("revenue.empty")}</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {[...revenue.entries()].map(([cur, r]) => (
                <li key={cur} className="flex justify-between">
                  <span>{cur}</span>
                  <span className="tabular-nums">{t("revenue.line", { earned: f.money(r.earned, cur), outstanding: f.money(r.outstanding, cur) })}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
