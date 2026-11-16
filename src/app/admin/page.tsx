import type { AdminOrganizationWithCount } from "@/features/admin/queries";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Briefcase, Building2, FileCheck2, Handshake, Scale, Send, Users, type LucideIcon } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { KpiTile } from "@/components/shared/kpi-tile";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { daysAgo, getAbuseFlags, getAdminQueues, getPresentationMetrics, listAdminHireReports, listAdminHireTasks, listHireReportFlags, type PresentationMetrics } from "@/features/admin/queries";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("admin"))("overview.title") };
}

// Access is gated by the admin layout (404 for non-admins); RLS and the RPCs re-check platform admin.
export default async function AdminOverviewPage() {
  const [db, t, tg, f] = await Promise.all([createClient(), getT("admin"), getGlobalT(), getFormatter()]);
  const monthAgo = daysAgo(30);
  const [metrics, users, newOrgs, newUsers, queues, recentOrgs, audit, platformLedger, dupMetrics, flags, hireRows, hireTasks, hireFlags] = await Promise.all([
    db.rpc("platform_metrics"),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("organizations").select("id", { count: "exact", head: true }).eq("is_demo", false).gte("created_at", monthAgo),
    db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", monthAgo),
    getAdminQueues(db),
    db.from("admin_organizations").select("id, name, kind, is_demo, suspended_at, created_at, organization_memberships(count)").order("created_at", { ascending: false }).limit(6),
    db
      .from("audit_events")
      .select("id, action, entity_type, created_at, actor:profiles!audit_events_actor_profile_fk(full_name), organization:organizations(name)")
      .order("created_at", { ascending: false })
      .limit(8),
    db.from("commission_ledger_entries").select("amount_minor, currency, entry_type").eq("party", "platform"),
    // N1 (Should): aggregates only. A failure here must not take the overview down.
    getPresentationMetrics(db, 30).catch(() => null),
    getAbuseFlags(db).catch(() => null),
    // N3 (spec §2.9, §2.14): the Hire reports tile and the HA-6 flag line. Failures never read as zero.
    listAdminHireReports(db).catch(() => null),
    listAdminHireTasks(db).catch(() => null),
    listHireReportFlags(db).catch(() => null),
  ]);
  // PD-075: section 1 (to decide) + fee-overdue tasks with no notice sent yet.
  const hireCount = hireRows && hireTasks ? hireRows.filter((r) => r.section === "decide").length + hireTasks.filter((x) => x.task === "fee_overdue" && !x.notice_sent_on).length : null;
  const pct = (n: number, d: number) => (d > 0 ? new Intl.NumberFormat(f.tag, { style: "percent", maximumFractionDigits: 0 }).format(n / d) : "—");
  const dup = (m: PresentationMetrics) =>
    [
      ["hitsJob", f.number(m.hits_job)],
      ["hitsClient", f.number(m.hits_client)],
      ["stops", f.number(m.stops)],
      ["pendingWarnings", f.number(m.pending_warnings)],
      ["identifierRefusals", f.number(m.identifier_refusals)],
      ["claims", f.number(m.claims)],
      ["contestRate", pct(m.contested, m.claims)],
      ["releases", f.number(m.releases)],
      ["openDisputes", f.number(m.open_referral_disputes)],
      ["resolvedOnTime", pct(m.resolved_within_5_business_days, m.resolved_referral_disputes)],
      ["rejectedShare", pct(m.claims_rejected, m.resolved_referral_disputes)],
    ] as const;
  const m = metrics.data?.[0];

  const revenue = new Map<string, { earned: number; outstanding: number }>();
  for (const e of platformLedger.data ?? []) {
    const r = revenue.get(e.currency) ?? { earned: 0, outstanding: 0 };
    if (e.entry_type === "allocation" || e.entry_type === "allocation_reversal") r.earned += e.amount_minor;
    r.outstanding += e.amount_minor;
    revenue.set(e.currency, r);
  }

  const attention: { key: "evidence" | "disputes" | "hireReports"; href: string; icon: LucideIcon; count: number | null }[] = [
    { key: "evidence", href: "/admin/evidence", icon: FileCheck2, count: queues.evidence },
    { key: "disputes", href: "/admin/disputes", icon: AlertTriangle, count: queues.disputes },
    { key: "hireReports", href: "/admin/hire-reports", icon: Scale, count: hireCount },
  ];
  const activity: { key: "activeJobs" | "activeCandidates" | "referrals"; icon: LucideIcon; value: number }[] = [
    { key: "activeJobs", icon: Briefcase, value: m?.active_jobs ?? 0 },
    { key: "activeCandidates", icon: Users, value: m?.active_candidates ?? 0 },
    { key: "referrals", icon: Send, value: m?.referrals ?? 0 },
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader title={t("overview.title")} description={t("overview.description")} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={t("kpi.organizations")} hint={t("kpi.newThisMonth", { count: String(newOrgs.count ?? 0) })} value={String(m?.organizations ?? 0)} tone="yellow" icon={Building2} href="/admin/organizations" />
        <KpiTile label={t("kpi.users")} hint={t("kpi.newThisMonth", { count: String(newUsers.count ?? 0) })} value={String(users.count ?? 0)} tone="lilac" icon={Users} href="/admin/users" />
        <KpiTile label={t("kpi.placements")} value={String(m?.placements ?? 0)} tone="blue" icon={Handshake} />
        <KpiTile label={t("kpi.attention")} hint={t("kpi.attentionHint")} value={String(queues.evidence + queues.disputes + (hireCount ?? 0))} tone="green" icon={AlertTriangle} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-3">
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
                    {a.count === null ? <StatusPill tone="danger" label={tg("errors.generic")} wrap /> : a.count ? <StatusPill tone="warning" label={t("overview.pending")} /> : <StatusPill tone="success" label={t("overview.clear")} />}
                  </div>
                  <div>
                    <p className="text-3xl font-semibold tracking-tight tabular-nums">{a.count ?? "—"}</p>
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
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
            {((recentOrgs.data ?? []) as unknown as AdminOrganizationWithCount[]).map((o) => (
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

        <Panel>
          <SectionTitle>{t("flags.title")}</SectionTitle>
          {flags === null ? (
            // A failed load must not read as an all-clear.
            <p role="alert" className="text-sm text-danger">{tg("errors.generic")}</p>
          ) : !flags.length && !hireFlags?.length ? (
            <p className="text-sm text-muted-foreground">{t("flags.empty")}</p>
          ) : (
            <ul className="grid gap-3">
              {flags.map((o) => (
                <li key={o.organization_id}>
                  <Link href={`/admin/organizations/${o.organization_id}`} className="flex items-start gap-3 rounded-xl hover:bg-accent/60">
                    <InitialsAvatar name={o.organization_name} className="size-9 rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{o.organization_name}</span>
                      {o.stops_7d > 5 ? <span className="block text-xs text-muted-foreground">{t("flags.stops", { count: o.stops_7d })}</span> : null}
                      {o.rejected_claims_90d >= 2 ? <span className="block text-xs text-muted-foreground">{t("flags.rejectedClaims", { count: o.rejected_claims_90d })}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {/* HA-6 (BR-40): sourcing orgs with 2+ rejected hire reports in 90 days. A failed read is said, never hidden. */}
          {hireFlags === null ? (
            <p role="alert" className="mt-3 text-sm text-danger">{tg("errors.generic")}</p>
          ) : hireFlags.length ? (
            <ul className="mt-3 grid gap-3">
              {hireFlags.map((o) => (
                <li key={`ha6-${o.organization_id}`}>
                  <Link href={`/admin/organizations/${o.organization_id}`} className="flex items-start gap-3 rounded-xl hover:bg-accent/60">
                    <InitialsAvatar name={o.organization_name} className="size-9 rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{o.organization_name}</span>
                      <span className="block text-xs text-pretty text-muted-foreground">{t("flags.rejectedHireReports", { count: o.rejected_90d })}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-4 text-xs text-muted-foreground">{t("flags.note")}</p>
        </Panel>

        <Panel className="xl:col-span-2">
          <SectionTitle>{t("duplicateMetrics.title")}</SectionTitle>
          {dupMetrics ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {dup(dupMetrics).map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-pretty text-muted-foreground">{t(`duplicateMetrics.${k}`)}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p role="alert" className="text-sm text-danger">{tg("errors.generic")}</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{t("overview.privacyNote")}</p>
        </Panel>

        {/* N2 S11 (AC-76): two counts only; a failed load shows the error, never zeros. */}
        <Panel>
          <SectionTitle>{t("termsMetrics.title")}</SectionTitle>
          {/* A missing count must not read as 0 (AC-76): any non-number shows the error instead. */}
          {dupMetrics && typeof dupMetrics.partner_visible_jobs === "number" && typeof dupMetrics.referral_open_without_terms === "number" ? (
            <dl className="grid gap-3">
              {([
                ["completeTerms", dupMetrics.partner_visible_jobs],
                ["hiddenJobs", dupMetrics.referral_open_without_terms],
              ] as const).map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-pretty text-muted-foreground">{t(`termsMetrics.${k}`)}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{f.number(v)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p role="alert" className="text-sm text-danger">{tg("errors.generic")}</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{t("overview.privacyNote")}</p>
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
