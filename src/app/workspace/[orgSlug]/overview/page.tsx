import { getRequestContext } from "@/server/auth/context";
import { GettingStarted } from "@/components/shared/getting-started";
import { PageHeader } from "@/components/shared/page-header";
import { loadOverview } from "@/features/overview/data";
import { OverviewStats } from "@/features/overview/components/overview-stats";
import { AttentionQueue } from "@/features/overview/components/attention-queue";
import { BestOpportunities } from "@/features/overview/components/best-opportunities";
import { RecruitingActivity } from "@/features/overview/components/recruiting-activity";
import { PipelineChart, type PipelineChartView, type PipelineSide } from "@/features/overview/components/pipeline-chart";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("overview"))("title") };
}

/**
 * The recruiter's workspace home, ordered by "what do I do next":
 * headline numbers → actions waiting on me → best matches for my candidates → pipeline progress.
 */
export default async function OverviewPage({ params }: PageProps<"/workspace/[orgSlug]/overview">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  const base = `/workspace/${orgSlug}`;
  const [t, f, data] = await Promise.all([getT("overview"), getFormatter(), loadOverview(ctx)]);
  const firstName = ctx.user.fullName.split(" ")[0] || t("welcomeFallbackName");

  const setupSteps = [
    {
      key: "candidate",
      title: t("gettingStarted.candidate.title"),
      description: t("gettingStarted.candidate.description"),
      done: data.setup.hasCandidate,
      cta: { label: t("gettingStarted.candidate.cta"), href: `${base}/candidates/new` },
    },
    {
      key: "matching",
      title: t("gettingStarted.matching.title"),
      description: t("gettingStarted.matching.description"),
      done: data.setup.hasActiveCandidate,
      cta: { label: t("gettingStarted.matching.cta"), href: `${base}/candidates?status=draft` },
    },
    {
      key: "job",
      title: t("gettingStarted.job.title"),
      description: t("gettingStarted.job.description"),
      done: data.setup.hasOpenJob,
      cta: { label: t("gettingStarted.job.cta"), href: `${base}/jobs/new` },
    },
    {
      key: "referral",
      title: t("gettingStarted.referral.title"),
      description: t("gettingStarted.referral.description"),
      done: data.setup.hasSentReferral,
      cta: { label: t("gettingStarted.referral.cta"), href: `${base}/opportunities` },
    },
  ];

  const views: PipelineChartView[] = (["received", "sent"] as const).map((side) => {
    const p = data.pipeline[side];
    const live = p.stages.reduce((n, s) => n + s.count, 0);
    return {
      side,
      tab: t(`pipeline.views.${side}`),
      total: f.number(live),
      totalLabel: t("pipeline.total", { count: live }),
      closed: p.closed ? t("pipeline.closed", { count: p.closed }) : null,
      href: side === "received" ? `${base}/pipeline` : `${base}/referrals?tab=sent`,
      linkLabel: side === "received" ? t("pipeline.open") : t("pipeline.openSent"),
      stages: p.stages.map((s) => ({
        key: s.key,
        label: t(`pipeline.stages.${s.key}`),
        count: s.count,
        value: f.number(s.count),
        share: t("pipeline.share", { percent: new Intl.NumberFormat(f.tag, { style: "percent" }).format(live ? s.count / live : 0) }),
      })),
    };
  });
  // Open on the side with live candidates (job owners first, like the Pipeline page).
  const liveIn = (side: PipelineSide) => data.pipeline[side].stages.some((s) => s.count > 0);
  const initialSide: PipelineSide = liveIn("received") || !liveIn("sent") ? "received" : "sent";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader title={t("welcome", { name: firstName })} description={t("subtitle")} showBell />
      {/* Pipeline at a glance, sharing the first row with the headline numbers */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <PipelineChart
          title={t("pipeline.title")}
          subtitle={t("pipeline.subtitle")}
          chartLabel={t("pipeline.chartLabel")}
          sideLabel={t("pipeline.viewsLabel")}
          emptyLabel={t("pipeline.empty")}
          views={views}
          initial={initialSide}
        />
        <OverviewStats base={base} data={data} stacked />
      </div>
      <GettingStarted steps={setupSteps} />
      <AttentionQueue base={base} data={data} />
      {data.canMatch ? <BestOpportunities base={base} data={data} /> : null}
      <RecruitingActivity base={base} data={data} />
    </div>
  );
}
