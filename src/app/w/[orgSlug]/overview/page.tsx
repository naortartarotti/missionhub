import Link from "next/link";
import { ArrowLeftRight, ArrowRight, Bell, CircleDollarSign, Handshake, Inbox, Sparkles, Users } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { ROLE_LABELS } from "@/server/authorization/permissions";
import { listOpportunities } from "@/features/matching/queries";
import { listPlacements } from "@/features/commissions/queries";
import { ledgerBalances, type LedgerEntry } from "@/features/commissions/domain";
import { KpiTile } from "@/components/shared/kpi-tile";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/features/matching/components/score-ring";
import { REFERRAL_STATUS, relativeTime } from "@/lib/labels";
import { formatMoney } from "@/lib/money/format";

export const metadata = { title: "Overview" };

export default async function OverviewPage({ params }: PageProps<"/w/[orgSlug]/overview">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  const base = `/w/${orgSlug}`;
  const org = ctx.organizationId;

  const [activeCandidates, opportunities, inProgress, incoming, pendingAgreements, notifications, placements, recentReferrals] = await Promise.all([
    ctx.db.from("candidates").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "active_for_matching"),
    listOpportunities(ctx),
    ctx.db.from("referrals").select("id", { count: "exact", head: true }).or(`source_org_id.eq.${org},target_org_id.eq.${org}`).in("status", ["submitted", "under_review", "info_requested", "accepted", "interviewing", "offer"]),
    ctx.db.from("referrals").select("id, candidate_label, job_title_snapshot, submitted_at, status").eq("target_org_id", org).in("status", ["submitted", "under_review"]).order("submitted_at", { ascending: false }).limit(5),
    ctx.db.from("referrals").select("id, job_title_snapshot, candidate_label, collaboration_agreements!inner(status)").eq("source_org_id", org).eq("collaboration_agreements.status", "pending_source").limit(5),
    ctx.db.from("notifications").select("id, title, body, link, created_at, read_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(6),
    listPlacements(ctx),
    ctx.db.from("referrals").select("id, candidate_label, job_title_snapshot, status, updated_at, source_org_id").or(`source_org_id.eq.${org},target_org_id.eq.${org}`).order("updated_at", { ascending: false }).limit(5),
  ]);

  const strong = opportunities.filter((o) => o.band === "strong" && !o.referral_id);
  const payable = placements
    .filter((p) => p.source_org_id === org && p.currency === ctx.currency)
    .reduce((sum, p) => sum + Math.max(0, ledgerBalances((p.ledger ?? []) as LedgerEntry[]).sourcingOutstanding), 0);
  const payoutsToConfirm = placements.filter((p) => p.source_org_id === org && p.status === "commission_payable").length;
  const firstName = ctx.user.fullName.split(" ")[0] || "there";
  const actions = [
    ...(incoming.data ?? []).map((r) => ({ key: r.id, icon: Inbox, title: `Review submission: ${r.candidate_label}`, sub: r.job_title_snapshot, href: `${base}/referrals/${r.id}` })),
    ...(pendingAgreements.data ?? []).map((r) => ({ key: `a-${r.id}`, icon: Handshake, title: `Confirm commission terms: ${r.job_title_snapshot}`, sub: r.candidate_label, href: `${base}/referrals/${r.id}` })),
    ...(payoutsToConfirm ? [{ key: "payouts", icon: CircleDollarSign, title: `${payoutsToConfirm} placement${payoutsToConfirm > 1 ? "s" : ""} with commission payable`, sub: "Confirm payouts when funds arrive", href: `${base}/commissions` }] : []),
  ];

  return (
    <div className="grid gap-8 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 content-start gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Welcome back, {firstName}!</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">Track partner opportunities, referrals and commissions for {ctx.organizationName}.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile label="Active candidates" value={String(activeCandidates.count ?? 0)} tone="yellow" icon={Users} href={`${base}/candidates?status=active_for_matching`} />
          <KpiTile label="Strong opportunities" hint="Not yet submitted" value={String(strong.length)} tone="blue" icon={Sparkles} href={`${base}/opportunities`} />
          <KpiTile label="Referrals in progress" value={String(inProgress.count ?? 0)} tone="lilac" icon={ArrowLeftRight} href={`${base}/referrals`} />
          <KpiTile label="Commission payable" hint="Verified, not yet paid" value={formatMoney(payable, ctx.currency)} tone="green" icon={CircleDollarSign} href={`${base}/commissions`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <section>
            <SectionTitle>Pending actions</SectionTitle>
            {actions.length === 0 ? (
              <Panel className="text-sm text-muted-foreground">You're all caught up.</Panel>
            ) : (
              <ul className="grid gap-3">
                {actions.slice(0, 5).map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-center gap-4 rounded-3xl border border-border/60 bg-card p-4 transition-colors hover:bg-muted/40">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted" aria-hidden><a.icon className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{a.title}</span>
                        <span className="block truncate text-sm text-muted-foreground">{a.sub}</span>
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionTitle action={<Button variant="outline" size="sm" asChild><Link href={`${base}/opportunities`}>View all</Link></Button>}>Top opportunities</SectionTitle>
            {strong.length === 0 ? (
              <Panel className="text-sm text-muted-foreground">
                No strong matches yet. <Link href={`${base}/candidates`} className="font-medium text-foreground underline-offset-4 hover:underline">Activate candidates</Link> to start matching against partner jobs.
              </Panel>
            ) : (
              <ul className="grid gap-3">
                {strong.slice(0, 3).map((o) => (
                  <li key={o.match_id}>
                    <Link href={`${base}/opportunities/${o.match_id}`} className="flex items-center gap-4 rounded-3xl border border-border/60 bg-card p-4 transition-colors hover:bg-muted/40">
                      <ScoreRing score={o.score} className="size-12" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{o.job_title}</span>
                        <span className="block truncate text-sm text-muted-foreground">{o.candidate_name} · via {o.job_org_name}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section>
          <SectionTitle>Recent referrals</SectionTitle>
          {(recentReferrals.data ?? []).length === 0 ? (
            <Panel className="text-sm text-muted-foreground">No referral activity yet.</Panel>
          ) : (
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[600px] text-sm">
                <caption className="sr-only">Recent referrals</caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-medium">Candidate</th>
                    <th scope="col" className="px-5 py-3 font-medium">Job</th>
                    <th scope="col" className="px-5 py-3 font-medium">Direction</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReferrals.data!.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="px-5 py-3.5"><Link href={`${base}/referrals/${r.id}`} className="font-medium underline-offset-4 hover:underline">{r.candidate_label}</Link></td>
                      <td className="px-5 py-3.5">{r.job_title_snapshot}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{r.source_org_id === org ? "Sent" : "Received"} · {relativeTime(r.updated_at)}</td>
                      <td className="px-5 py-3.5 text-right"><StatusPill tone={REFERRAL_STATUS[r.status].tone} label={REFERRAL_STATUS[r.status].label} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </section>
      </div>

      <aside className="grid min-w-0 content-start gap-6 rounded-[2rem] bg-muted/60 p-6">
        <div className="flex flex-col items-center text-center">
          <InitialsAvatar name={ctx.user.fullName || ctx.user.email} className="size-20 text-2xl" />
          <p className="mt-3 text-lg font-semibold">{ctx.user.fullName || ctx.user.email}</p>
          <p className="text-sm text-muted-foreground">{ROLE_LABELS[ctx.membershipRole]} · {ctx.organizationName}</p>
        </div>
        <div className="h-px bg-border" />
        <section>
          <SectionTitle action={<Button variant="outline" size="sm" asChild><Link href={`${base}/notifications`}>View all</Link></Button>}>Activity</SectionTitle>
          {(notifications.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="grid gap-3">
              {notifications.data!.map((n) => (
                <li key={n.id} className="rounded-2xl bg-card p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {!n.read_at ? <span className="size-2 rounded-full bg-danger" aria-label="Unread" /> : <Bell className="size-3.5 text-muted-foreground" aria-hidden />}
                    {n.title}
                  </p>
                  {n.body ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">{relativeTime(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
