import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Panel } from "@/components/shared/card";
import { ScoreRing } from "@/features/matching/components/score-ring";
import { asEvidence } from "@/features/matching/queries";
import { evidenceText } from "@/features/matching/evidence";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import type { BestOpportunity, OverviewData } from "../data";

/**
 * Top three candidate → partner job matches still awaiting a decision. One row per job, led by its
 * best-scoring candidate; the full list stays on the Opportunities page.
 */
export async function BestOpportunities({ base, data }: { base: string; data: OverviewData }) {
  const t = await getT("overview");
  const list = data.bestOpportunities;

  return (
    <section aria-labelledby="best-title" className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="best-title" className="min-w-0 text-lg font-semibold tracking-tight">{t("best.title")}</h2>
        {list.length ? (
          <Link href={`${base}/opportunities`} className="shrink-0 text-sm font-medium underline-offset-4 hover:underline">
            {t("best.viewAll")}
          </Link>
        ) : null}
      </header>

      {list.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
          <Sparkles className="size-5 shrink-0" aria-hidden />
          <span>
            {data.setup.hasActiveCandidate ? (
              t("best.empty")
            ) : (
              <>
                {t("best.noneInactive")}{" "}
                <Link href={`${base}/candidates`} className="font-medium text-foreground underline-offset-4 hover:underline">{t("best.noneInactiveLink")}</Link>{" "}
                {t("best.noneInactiveTail")}
              </>
            )}
          </span>
        </div>
      ) : (
        <Panel className="p-2 sm:p-3">
          <ul className="divide-y divide-border/60">
            {list.map((o) => (
              <li key={o.jobId}>
                <OpportunityRow base={base} o={o} currency={data.stats.currency} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  );
}

async function OpportunityRow({ base, o, currency }: { base: string; o: BestOpportunity; currency: string }) {
  const [t, tg, f] = await Promise.all([getT("overview"), getGlobalT(), getFormatter()]);
  const top = o.top;
  // The engine's own first stated reason, rendered in the viewer's language. Omitted when the match has none.
  const reason = asEvidence(top.reasons)[0];
  const more = o.candidateCount - 1;
  const href = `${base}/opportunities?match=${top.match_id}`;

  return (
    // The whole row opens the match; the "+N more" link sits above the row link (z-10).
    <div className="group relative flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-muted/60 sm:items-center sm:gap-4">
      <ScoreRing score={top.score} className="size-11" />
      <div className="min-w-0 flex-1">
        <Link href={href} className="block truncate text-sm font-semibold after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none group-has-[a:focus-visible]:underline">
          {o.jobTitle}
        </Link>
        <p className="flex min-w-0 items-center gap-x-2 text-sm">
          <span className="truncate">
            <span className="font-medium">{top.candidate_name}</span>
            <span className="text-muted-foreground"> · {o.jobOrg}</span>
          </span>
          {more > 0 ? (
            <Link href={`${base}/opportunities?job=${o.jobId}`} className="relative z-10 shrink-0 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {t("best.more", { count: more })}
            </Link>
          ) : null}
        </p>
        {reason ? (
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Check className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
            <span className="line-clamp-1">{evidenceText(reason, tg)}</span>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="hidden items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors group-hover:border-foreground/20 sm:inline-flex">
          {t("best.action")}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
        {top.your_share_minor ? (
          <span className="text-xs font-medium text-success tabular-nums">{t("best.share", { amount: f.money(top.your_share_minor, top.fee_currency ?? currency, { whole: true }) })}</span>
        ) : null}
      </div>
    </div>
  );
}
