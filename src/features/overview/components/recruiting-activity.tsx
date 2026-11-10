import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Panel } from "@/components/shared/card";
import { cn } from "@/lib/utils";
import { getFormatter, getT } from "@/i18n/server";
import type { OverviewData } from "../data";

type Metric = { key: string; label: string; value: number; href: string };

/**
 * Pipeline progress on both sides of the marketplace. Pending decisions live in "Needs your attention",
 * so this only counts what is already moving (or could).
 */
export async function RecruitingActivity({ base, data }: { base: string; data: OverviewData }) {
  const t = await getT("overview");
  const { sent, jobs } = data.activity;

  const candidateMetrics: Metric[] = [
    { key: "sent", label: t("activity.candidates.sent"), value: sent.total, href: `${base}/referrals?tab=sent` },
    { key: "progressing", label: t("activity.candidates.progressing"), value: sent.progressing, href: `${base}/referrals?tab=sent` },
    { key: "hired", label: t("activity.candidates.hired"), value: sent.hired, href: `${base}/referrals?tab=sent` },
  ];
  const jobMetrics: Metric[] = [
    { key: "open", label: t("activity.jobs.open"), value: jobs.open, href: `${base}/jobs` },
    ...(jobs.partnerFits !== null ? [{ key: "fits", label: t("activity.jobs.fits"), value: jobs.partnerFits, href: `${base}/jobs` }] : []),
    { key: "progressing", label: t("activity.jobs.progressing"), value: jobs.progressing, href: `${base}/referrals?tab=received&bucket=active` },
  ];

  return (
    <section aria-labelledby="activity-title" className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <h2 id="activity-title" className="text-lg font-semibold tracking-tight">{t("activity.title")}</h2>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        <ActivityPanel
          title={t("activity.candidates.title")}
          metrics={candidateMetrics}
          viewAll={{ label: t("activity.viewAll"), href: `${base}/referrals?tab=sent` }}
        />
        <ActivityPanel
          title={t("activity.jobs.title")}
          metrics={jobs.open === 0 && jobs.progressing === 0 ? [] : jobMetrics}
          empty={{ label: t("activity.jobs.none"), cta: t("activity.jobs.create"), href: `${base}/jobs/new` }}
          viewAll={{ label: t("activity.viewAll"), href: `${base}/jobs` }}
        />
      </div>
    </section>
  );
}

async function ActivityPanel({
  title,
  metrics,
  viewAll,
  empty,
}: {
  title: string;
  metrics: Metric[];
  viewAll: { label: string; href: string };
  empty?: { label: string; cta: string; href: string };
}) {
  const f = await getFormatter();
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link href={viewAll.href} className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {viewAll.label}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {metrics.length === 0 && empty ? (
        <p className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-muted/60 px-3 py-3 text-sm text-muted-foreground">
          {empty.label}
          <Link href={empty.href} className="font-medium text-foreground underline-offset-4 hover:underline">{empty.cta}</Link>
        </p>
      ) : (
        <ul className={cn("grid gap-2", metrics.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {metrics.map((m) => (
            <li key={m.key} className="min-w-0">
              <Link href={m.href} className="flex h-full flex-col rounded-2xl bg-muted/60 px-3 py-2.5 transition-colors hover:bg-muted">
                <span className={cn("text-lg font-semibold tabular-nums leading-tight", m.value === 0 && "text-muted-foreground")}>{f.number(m.value)}</span>
                <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
