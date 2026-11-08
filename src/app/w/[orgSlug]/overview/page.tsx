import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CircleDollarSign, Handshake, Plus, Sparkles } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { getJobMatchSummary, listOpportunities, needsDecision } from "@/features/matching/queries";
import { listPlacements } from "@/features/commissions/queries";
import { ledgerBalances, type LedgerEntry } from "@/features/commissions/domain";
import { StatTile } from "@/components/shared/stat-tile";
import { GettingStarted } from "@/components/shared/getting-started";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { DirectionBadge } from "@/features/referrals/components/direction-badge";
import { ScoreRing } from "@/features/matching/components/score-ring";
import { cn } from "@/lib/utils";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("overview"))("title") };
}

export default async function OverviewPage({ params }: PageProps<"/w/[orgSlug]/overview">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  const base = `/w/${orgSlug}`;
  const org = ctx.organizationId;
  const [t, tg, f] = await Promise.all([getT("overview"), getGlobalT(), getFormatter()]);

  const [activeCandidates, opportunities, myJobs, received, pendingAgreements, placements, allCandidates, openJobs, sentReferrals] = await Promise.all([
    ctx.db.from("candidates").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "active_for_matching"),
    listOpportunities(ctx),
    ctx.db.from("jobs").select("id, title, status, client_name, client_confidential, work_arrangement, location_city, accepts_external_referrals").eq("organization_id", org).in("status", ["active", "paused", "draft"]).order("created_at", { ascending: false }).limit(20),
    ctx.db.from("referrals").select("job_id, status").eq("target_org_id", org),
    ctx.db.from("referrals").select("id, job_title_snapshot, candidate_label, collaboration_agreements!inner(status)").eq("source_org_id", org).eq("collaboration_agreements.status", "pending_source").limit(5),
    listPlacements(ctx),
    ctx.db.from("candidates").select("id", { count: "exact", head: true }).eq("organization_id", org).neq("status", "deleted"),
    ctx.db.from("jobs").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "active").eq("accepts_external_referrals", true),
    ctx.db.from("referrals").select("id", { count: "exact", head: true }).eq("source_org_id", org),
  ]);
  const activeCount = activeCandidates.count ?? 0;
  const setupSteps = [
    {
      key: "candidate",
      title: t("gettingStarted.candidate.title"),
      description: t("gettingStarted.candidate.description"),
      done: (allCandidates.count ?? 0) > 0,
      cta: { label: t("gettingStarted.candidate.cta"), href: `${base}/candidates/new` },
    },
    {
      key: "matching",
      title: t("gettingStarted.matching.title"),
      description: t("gettingStarted.matching.description"),
      done: activeCount > 0,
      cta: { label: t("gettingStarted.matching.cta"), href: `${base}/candidates?status=draft` },
    },
    {
      key: "job",
      title: t("gettingStarted.job.title"),
      description: t("gettingStarted.job.description"),
      done: (openJobs.count ?? 0) > 0,
      cta: { label: t("gettingStarted.job.cta"), href: `${base}/jobs/new` },
    },
    {
      key: "referral",
      title: t("gettingStarted.referral.title"),
      description: t("gettingStarted.referral.description"),
      done: (sentReferrals.count ?? 0) > 0,
      cta: { label: t("gettingStarted.referral.cta"), href: `${base}/opportunities` },
    },
  ];

  // ---- Partner jobs that fit my candidates (job = first level) -----------------------------
  type PartnerJob = { id: string; title: string; org: string; client: string; matches: number; strong: number; fresh: number; share: number | null; currency: string; best: number };
  const partnerJobs = new Map<string, PartnerJob>();
  for (const o of opportunities.filter(needsDecision)) {
    const j = partnerJobs.get(o.job_id) ?? { id: o.job_id, title: o.job_title, org: o.job_org_name, client: o.client_label, matches: 0, strong: 0, fresh: 0, share: o.your_share_minor, currency: o.fee_currency ?? ctx.currency, best: 0 };
    j.matches += 1;
    if (o.band === "strong") j.strong += 1;
    if (o.is_new) j.fresh += 1;
    j.best = Math.max(j.best, o.score);
    partnerJobs.set(o.job_id, j);
  }
  const partnerList = [...partnerJobs.values()].sort((a, b) => b.fresh - a.fresh || b.strong - a.strong || b.best - a.best);
  const toDecide = opportunities.filter(needsDecision).length;

  // ---- My jobs: referrals received + anonymous partner matches -----------------------------
  const PENDING = new Set(["submitted", "under_review"]);
  const recv = new Map<string, { total: number; pending: number }>();
  for (const r of received.data ?? []) {
    const c = recv.get(r.job_id) ?? { total: 0, pending: 0 };
    c.total += 1;
    if (PENDING.has(r.status)) c.pending += 1;
    recv.set(r.job_id, c);
  }
  // Jobs with referrals waiting come first; then the most recent. Match counts only for the ones shown.
  const shown = (myJobs.data ?? [])
    .map((j) => ({ ...j, recv: recv.get(j.id) ?? { total: 0, pending: 0 } }))
    .sort((a, b) => b.recv.pending - a.recv.pending || b.recv.total - a.recv.total)
    .slice(0, 8);
  const summaries = await Promise.all(
    shown.map((j) => (j.status === "active" && j.accepts_external_referrals ? getJobMatchSummary(ctx, j.id) : Promise.resolve(null))),
  );
  const myJobList = shown.map((j, i) => ({ ...j, summary: summaries[i] }));
  const pendingReview = [...recv.values()].reduce((n, c) => n + c.pending, 0);

  // ---- Money + the few things that aren't tied to a job -----------------------------------
  const payable = placements
    .filter((p) => p.source_org_id === org && p.currency === ctx.currency)
    .reduce((sum, p) => sum + Math.max(0, ledgerBalances((p.ledger ?? []) as LedgerEntry[]).sourcingOutstanding), 0);
  const payoutsToConfirm = placements.filter((p) => p.source_org_id === org && p.status === "commission_payable").length;
  const firstName = ctx.user.fullName.split(" ")[0] || t("welcomeFallbackName");
  const actions = [
    ...(pendingAgreements.data ?? []).map((r) => ({ key: `a-${r.id}`, icon: Handshake, title: t("attention.confirmSplit", { job: r.job_title_snapshot }), sub: r.candidate_label, href: `${base}/referrals/${r.id}` })),
    ...(payoutsToConfirm ? [{ key: "payouts", icon: CircleDollarSign, title: t("attention.payable", { count: payoutsToConfirm }), sub: t("attention.payableSub"), href: `${base}/commissions` }] : []),
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("welcome", { name: firstName })} description={t("subtitle", { org: ctx.organizationName })} />

      <GettingStarted steps={setupSteps} />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label={t("stats.matching")} value={String(activeCount)} />
        <StatTile label={t("stats.toDecide")} value={String(toDecide)} />
        <StatTile label={t("stats.toReview")} value={String(pendingReview)} />
        <StatTile label={t("stats.owed")} value={f.money(payable, ctx.currency, { whole: true })} tone={payable ? "success" : undefined} />
      </div>

      {actions.length ? (
        <ul className="grid gap-2">
          {actions.map((a) => (
            <li key={a.key}>
              <Link href={a.href} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 transition-colors hover:bg-muted/40">
                <a.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm"><span className="font-medium">{a.title}</span> <span className="text-muted-foreground">· {a.sub}</span></span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        {/* ① Partner jobs → my candidates */}
        <section className="overflow-hidden rounded-3xl border border-border/60 bg-card">
          <header className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
            <div className="min-w-0">
              <DirectionBadge direction="outbound" label={t("partnerJobs.badge")} />
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight">{t("partnerJobs.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("partnerJobs.subtitle")}</p>
            </div>
            <Button variant="outline" size="sm" asChild><Link href={`${base}/opportunities`}>{tg("common.actions.viewAll")}</Link></Button>
          </header>
          {partnerList.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-6 text-sm text-muted-foreground">
              <Sparkles className="size-5 shrink-0" aria-hidden />
              <span>
                {activeCount === 0 ? (
                  <>{t("best.noneInactive")} <Link href={`${base}/candidates`} className="font-medium text-foreground underline-offset-4 hover:underline">{t("best.noneInactiveLink")}</Link> {t("best.noneInactiveTail")}</>
                ) : (
                  t("partnerJobs.empty")
                )}
              </span>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {partnerList.slice(0, 6).map((j) => (
                <li key={j.id}>
                  <Link href={`${base}/opportunities?job=${j.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40">
                    <ScoreRing score={j.best} className="size-11 [&_span]:text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {j.fresh ? <span className="size-2 shrink-0 rounded-full bg-info" aria-label={t("partnerJobs.new", { count: j.fresh })} /> : null}
                        <span className="truncate font-medium">{j.title}</span>
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">{j.org} · {j.client}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">{t("partnerJobs.matches", { count: j.matches })}</span>
                      <span className={cn("block text-xs tabular-nums", j.share ? "text-success" : "text-muted-foreground")}>
                        {j.share ? t("partnerJobs.share", { amount: f.money(j.share, j.currency, { whole: true }) }) : t("partnerJobs.strong", { count: j.strong })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ② My jobs → partners' candidates */}
        <section className="overflow-hidden rounded-3xl border border-border/60 bg-card">
          <header className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
            <div className="min-w-0">
              <DirectionBadge direction="inbound" label={t("myJobs.badge")} />
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight">{t("myJobs.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("myJobs.subtitle")}</p>
            </div>
            <Button variant="outline" size="sm" asChild><Link href={`${base}/jobs`}>{tg("common.actions.viewAll")}</Link></Button>
          </header>
          {myJobList.length === 0 ? (
            <div className="flex items-center justify-between gap-3 px-5 py-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-3"><BriefcaseBusiness className="size-5 shrink-0" aria-hidden />{t("myJobs.empty")}</span>
              <Button size="sm" asChild><Link href={`${base}/jobs/new`}><Plus className="size-4" aria-hidden />{t("gettingStarted.job.cta")}</Link></Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {myJobList.map((j) => {
                const href = j.recv.total ? `${base}/referrals?tab=received&job=${j.id}` : `${base}/jobs/${j.id}`;
                const matchCount = j.summary ? j.summary.strong_count + j.summary.potential_count : null;
                return (
                  <li key={j.id}>
                    <Link href={href} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40">
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-tile-blue text-tile-foreground">
                        <BriefcaseBusiness className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{j.title}</span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {j.status === "active"
                            ? matchCount === null
                              ? t("myJobs.notOpen")
                              : t("myJobs.partnerMatches", { count: matchCount })
                            : tg(`labels.jobStatus.${j.status}`)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums">{t("myJobs.received", { count: j.recv.total })}</span>
                        {j.recv.pending ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-info">
                            <span className="size-1.5 rounded-full bg-info" aria-hidden />
                            {t("myJobs.toReview", { count: j.recv.pending })}
                          </span>
                        ) : (
                          <span className="block text-xs text-muted-foreground">{t("myJobs.noneWaiting")}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
