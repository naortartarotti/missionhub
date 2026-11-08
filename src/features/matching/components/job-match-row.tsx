"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useGlobalT, useT } from "@/i18n/client";
import { REFERRAL_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { isSubmitted } from "../triage";
import { TriageActions, type OpportunityView } from "./opportunity-card";
import { ScoreRing } from "./score-ring";

const BAND_DOT: Record<OpportunityView["band"], string> = {
  strong: "bg-success",
  potential: "bg-amber-500",
  not_eligible: "bg-danger",
};

/**
 * One of your candidates inside a job card. The whole row opens the details panel; the icon
 * actions and the primary button sit above that link (z-10) so they stay independently clickable.
 */
export function JobMatchRow({ opp, orgSlug, detailHref, selected }: { opp: OpportunityView; orgSlug: string; detailHref: string; selected: boolean }) {
  const t = useT("opportunities");
  const tg = useGlobalT();
  const submitted = isSubmitted(opp);
  const canAct = !submitted && opp.band !== "not_eligible";
  const gaps = opp.gaps.length;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted/60",
        selected && "bg-muted",
        opp.triage_state === "dismissed" && "opacity-60",
      )}
    >
      <ScoreRing score={opp.score} className="size-11 [&_span]:text-xs" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {opp.is_new && canAct ? <span className="size-2 shrink-0 rounded-full bg-info" aria-label={t("card.new")} /> : null}
          <Link
            href={detailHref}
            scroll={false}
            aria-current={selected ? "true" : undefined}
            aria-label={t("row.details", { name: opp.candidate_name })}
            className="truncate font-medium outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {opp.candidate_name}
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", BAND_DOT[opp.band])} aria-hidden />
            {tg(`labels.band.${opp.band}`)}
          </span>
        </div>
        <p className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate">{opp.candidate_headline ?? t("card.noHeadline")}</span>
          {gaps ? <span className="shrink-0 text-warning">· {t("row.gaps", { count: gaps })}</span> : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {submitted && opp.referral_id ? (
          <Button variant="outline" size="sm" asChild className="relative z-10">
            <Link href={`/w/${orgSlug}/referrals/${opp.referral_id}`}>{tg(`labels.referralStatus.${opp.referral_status as keyof typeof REFERRAL_STATUS}`)}</Link>
          </Button>
        ) : null}
        {canAct ? <TriageActions opp={opp} orgSlug={orgSlug} compact /> : null}
        {canAct && opp.triage_state !== "dismissed" ? (
          <Button size="sm" asChild className="relative z-10 ml-1">
            <Link href={`/w/${orgSlug}/opportunities/${opp.match_id}`} aria-label={t("row.submitAria", { name: opp.candidate_name })}>
              {t("row.submit")}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
