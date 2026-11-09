import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, CircleDollarSign, Handshake, Inbox, Plus, Sparkles, Users } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { getJobMatchSummary, listOpportunities, needsDecision } from "@/features/matching/queries";
import { listPlacements } from "@/features/commissions/queries";
import { ledgerBalances, type LedgerEntry } from "@/features/commissions/domain";
import { KpiTile } from "@/components/shared/kpi-tile";
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
  const freshMatches = partnerList.reduce((n, j) => n + j.fresh, 0);
  const actions = [
    ...myJobList
      .filter((j) => j.recv.pending)
      .map((j) => ({ key: `r-${j.id}`, icon: Inbox, title: t("attentionExtra.review", { count: j.recv.pending, job: j.title }), sub: t("attentionExtra.reviewSub"), href: `${base}/referrals?tab=received&job=${j.id}` })),
    ...(pendingAgreements.data ?? []).map((r) => ({ key: `a-${r.id}`, icon: Handshake, title: t("attention.confirmSplit", { job: r.job_title_snapshot }), sub: r.candidate_label, href: `${base}/referrals/${r.id}` })),
    ...(payoutsToConfirm ? [{ key: "payouts", icon: CircleDollarSign, title: t("attention.payable", { count: payoutsToConfirm }), sub: t("attention.payableSub"), href: `${base}/commissions` }] : []),
    ...(freshMatches ? [{ key: "fresh", icon: Sparkles, title: t("attentionExtra.newMatches", { count: freshMatches }), sub: t("attentionExtra.newMatchesSub"), href: `${base}/opportunities` }] : []),
  ].slice(0, 4);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("welcome", { name: firstName })} description={t("subtitle", { org: ctx.organizationName })} showBell />

      <GettingStarted steps={setupSteps} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={t("stats.matching")} value={String(activeCount)} tone="yellow" icon={Users} href={`${base}/candidates?status=active_for_matching`} />
        <KpiTile label={t("stats.toDecide")} value={String(toDecide)} tone="blue" icon={Sparkles} href={`${base}/opportunities`} />
        <KpiTile label={t("stats.toReview")} value={String(pendingReview)} tone="lilac" icon={Inbox} href={`${base}/referrals?tab=received`} />
        <KpiTile label={t("stats.owed")} value={f.money(payable, ctx.currency, { whole: true })} tone="green" icon={CircleDollarSign} href={`${base}/commissions`} />
      </div>

      {/* Hero: what's in it for me + what to do next */}
      <section className="relative overflow-hidden rounded-3xl bg-primary text-primary-foreground">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-tile-yellow/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-tile-lilac/20 blur-3xl" />
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.25fr_1fr] lg:gap-10">
          <div className="flex min-w-0 flex-col justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-tile-yellow px-2.5 py-1 text-xs font-semibold text-tile-foreground">
                <Sparkles className="size-3.5" aria-hidden />
                {t("hero.eyebrow")}
              </span>
              <p className="mt-4 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                {t("hero.amountNone", { count: toDecide })}
              </p>
              <p className="mt-3 max-w-md text-[15px] opacity-75">
                {partnerList.length ? t("hero.body", { count: partnerList.length }) : t("partnerJobs.empty")}
              </p>
            </div>
            {partnerList.length ? (
              <div>
                <Button asChild size="lg" className="rounded-full bg-tile-yellow text-tile-foreground hover:bg-tile-yellow/90">
                  <Link href={`${base}/opportunities`}>
                    {t("hero.cta")}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>

          <div className="min-w-0 rounded-2xl bg-primary-foreground/[0.07] p-2 ring-1 ring-primary-foreground/10">
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider opacity-60">{t("hero.upNext")}</p>
            {actions.length ? (
              <ul className="grid">
                {actions.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-primary-foreground/10">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-foreground/10">
                        <a.icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.title}</span>
                        <span className="block truncate text-xs opacity-60">{a.sub}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-3 px-3 py-4 text-sm opacity-75">
                <CheckCircle2 className="size-5 shrink-0" aria-hidden />
                {t("hero.caughtUp")}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ① Partner jobs → my candidates */}
      <section className="grid gap-4">
        <SectionHeader
          badge={<DirectionBadge direction="outbound" label={t("partnerJobs.badge")} />}
          title={t("partnerJobs.title")}
          subtitle={t("partnerJobs.subtitle")}
          action={<Button variant="outline" size="sm" asChild><Link href={`${base}/opportunities`}>{tg("common.actions.viewAll")}</Link></Button>}
        />
        {partnerList.length === 0 ? (
          <div className="flex items-center gap-3 rounded-3xl border border-dashed border-border px-5 py-6 text-sm text-muted-foreground">
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
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {partnerList.slice(0, 6).map((j) => (
              <li key={j.id} className="min-w-0">
                <Link
                  href={`${base}/opportunities?job=${j.id}`}
                  className="group flex h-full flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-lg hover:shadow-black/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <ScoreRing score={j.best} className="size-12" />
                    {j.fresh ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-xs font-semibold text-info" aria-label={t("partnerJobs.new", { count: j.fresh })}>
                        <span className="size-1.5 rounded-full bg-info" aria-hidden />
                        {t("cards.new")}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-semibold leading-snug">{j.title}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{j.org} · {j.client}</p>
                  </div>
                  <div className="flex items-end justify-between gap-3 border-t border-border/60 pt-4">
                    {j.share ? (
                      <span className="min-w-0">
                        <span className="block text-2xl font-semibold tracking-tight text-success tabular-nums">~{f.money(j.share, j.currency, { whole: true })}</span>
                        <span className="block text-xs text-muted-foreground">{t("cards.forYou")}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("partnerJobs.strong", { count: j.strong })}</span>
                    )}
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-tile-lilac px-2.5 py-1 text-xs font-medium text-tile-foreground">
                      <Users className="size-3.5" aria-hidden />
                      {t("partnerJobs.matches", { count: j.matches })}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ② My jobs → partners' candidates */}
      <section className="grid gap-4">
        <SectionHeader
          badge={<DirectionBadge direction="inbound" label={t("myJobs.badge")} />}
          title={t("myJobs.title")}
          subtitle={t("myJobs.subtitle")}
          action={<Button variant="outline" size="sm" asChild><Link href={`${base}/jobs`}>{tg("common.actions.viewAll")}</Link></Button>}
        />
        {myJobList.length === 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-3xl border border-dashed border-border px-5 py-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-3"><BriefcaseBusiness className="size-5 shrink-0" aria-hidden />{t("myJobs.empty")}</span>
            <Button size="sm" asChild><Link href={`${base}/jobs/new`}><Plus className="size-4" aria-hidden />{t("gettingStarted.job.cta")}</Link></Button>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {myJobList.map((j) => {
              const href = j.recv.total ? `${base}/referrals?tab=received&job=${j.id}` : `${base}/jobs/${j.id}`;
              const matchCount = j.summary ? j.summary.strong_count + j.summary.potential_count : null;
              const hot = j.recv.pending > 0;
              return (
                <li key={j.id} className="min-w-0">
                  <Link
                    href={href}
                    className={cn(
                      "group flex h-full flex-col gap-4 rounded-3xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5",
                      hot ? "border-info/40 ring-1 ring-info/30" : "border-border/60 hover:border-border",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tile-blue text-tile-foreground">
                        <BriefcaseBusiness className="size-4" aria-hidden />
                      </span>
                      {hot ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-info px-2.5 py-1 text-xs font-semibold text-white dark:text-black">
                          {t("cards.reviewNow")}
                          <ArrowRight className="size-3" aria-hidden />
                        </span>
                      ) : j.status !== "active" ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{tg(`labels.jobStatus.${j.status}`)}</span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 flex-1 font-semibold leading-snug">{j.title}</p>
                    {j.status === "active" && matchCount === null ? (
                      <p className="border-t border-border/60 pt-4 text-xs text-muted-foreground">{t("myJobs.notOpen")}</p>
                    ) : (
                      <dl className="grid grid-cols-3 gap-2 border-t border-border/60 pt-4 text-center">
                        <Stat value={matchCount ?? 0} label={t("cards.fit")} />
                        <Stat value={j.recv.total} label={t("cards.referred")} />
                        <Stat value={j.recv.pending} label={t("cards.review")} highlight={hot} />
                      </dl>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionHeader({ badge, title, subtitle, action }: { badge: React.ReactNode; title: string; subtitle: string; action: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {badge}
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

function Stat({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl px-1 py-1.5", highlight && "bg-info-soft text-info")}>
      <dt className="sr-only">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums leading-none">{value}</dd>
      <dd className={cn("mt-1 truncate text-[11px]", highlight ? "font-medium" : "text-muted-foreground")}>{label}</dd>
    </div>
  );
}
