import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  CalendarDays,
  ChevronRight,
  CircleDashed,
  CircleDollarSign,
  Eye,
  EyeOff,
  Inbox,
  Languages,
  MapPin,
  KanbanSquare,
  Pencil,
  Plane,
  Radio,
  Sparkles,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { can, getRequestContext } from "@/server/auth/context";
import { getJob, listJobReferrals } from "@/features/jobs/queries";
import { getJobTermsContext } from "@/features/jobs/terms-context";
import { feeShort, termsFromState } from "@/features/jobs/terms-display";
import { hiddenReasonOf, restrictionReasonOf } from "@/features/jobs/nudge";
import { TermsSummary } from "@/features/jobs/components/terms-summary";
import { estimateFee } from "@/lib/money/terms";
import { getJobMatchSummary } from "@/features/matching/queries";
import { JobStatusActions } from "@/features/jobs/components/job-status-actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { KpiTile } from "@/components/shared/kpi-tile";
import { SkillChips } from "@/components/shared/skill-chips";
import { ExpandableText } from "@/components/shared/expandable-text";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Flash } from "@/components/shared/flash";
import { JOB_STATUS, REFERRAL_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("jobs"))("detail.metaTitle") };
}

/**
 * Referral statuses grouped into the stages a job owner tracks; the rest count as closed.
 * Same stages as the Home chart and the Referrals › Pipeline board, so the numbers agree.
 */
const PIPELINE = [
  { key: "pipelineReview", statuses: ["submitted", "under_review", "info_requested"], tone: "bg-tile-blue" },
  { key: "pipelineAccepted", statuses: ["accepted"], tone: "bg-tile-lilac" },
  { key: "pipelineInterviewing", statuses: ["interviewing"], tone: "bg-tile-lilac" },
  { key: "pipelineOffer", statuses: ["offer"], tone: "bg-tile-yellow" },
  { key: "pipelineHired", statuses: ["hired"], tone: "bg-tile-green" },
] as const;

export default async function JobPage({ params, searchParams }: PageProps<"/workspace/[orgSlug]/jobs/[jobId]">) {
  const { orgSlug, jobId } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const job = await getJob(ctx, jobId);
  if (!job) notFound();
  const [summary, referrals, terms, t, tg, f, tp] = await Promise.all([getJobMatchSummary(ctx, jobId), listJobReferrals(ctx, jobId), getJobTermsContext(ctx, jobId), getT("jobs"), getGlobalT(), getFormatter(), getT("pipeline")]);
  const st = JOB_STATUS[job.status];
  const canWrite = can(ctx, "jobs:write");
  const editHref = `/workspace/${orgSlug}/jobs/${jobId}/edit`;
  // N2: partner matching runs only on partner-visible jobs (BR-3); the owner gets the reason (BR-7).
  const current = terms.row ? termsFromState(terms.row) : null;
  const hidden = job.status === "active" ? ((job.accepts_external_referrals ? restrictionReasonOf(ctx.restriction) : null) ?? hiddenReasonOf(terms.row)) : null;
  const isOrgAdmin = ctx.membershipRole === "org_admin";
  const tn = await getT("network");
  const rulesLabel = ctx.rules.required?.label ?? ctx.rules.current?.label ?? "";
  const matching = job.accepts_external_referrals && job.status === "active" && Boolean(terms.row?.partner_visible);
  const ownerEstimate = current && current.feeBasis !== "flat" ? estimateFee(current, { shareSalary: job.share_salary, salaryMin: job.salary_min, salaryMax: job.salary_max }) : null;
  const location = [job.location_city, job.location_region, job.location_country].filter(Boolean).join(", ");
  const partnerFits = summary.strong_count + summary.potential_count;

  const visibility = [
    { label: t("detail.visible.always"), shown: true },
    { label: t("detail.visible.terms"), shown: true },
    { label: t("detail.visible.description"), shown: job.share_description },
    { label: t("detail.visible.location"), shown: job.share_location },
    { label: t("detail.visible.compensation"), shown: job.share_salary },
    { label: t("detail.visible.clientName"), shown: !job.client_confidential },
  ];

  const stages = PIPELINE.map((s) => ({ ...s, count: referrals.filter((r) => (s.statuses as readonly string[]).includes(r.status)).length }));
  const closedCount = referrals.length - stages.reduce((n, s) => n + s.count, 0);

  const salary =
    job.salary_min && job.salary_max
      ? `${f.money(job.salary_min, job.salary_currency, { whole: true, code: true })} – ${f.money(job.salary_max, job.salary_currency, { whole: true, code: true })}`
      : job.salary_min || job.salary_max
        ? f.money((job.salary_min || job.salary_max)!, job.salary_currency, { whole: true, code: true })
        : "—";

  const details: { icon: LucideIcon; label: string; value: string; className?: string }[] = [
    { icon: Award, label: t("detail.seniority"), value: `${job.seniority ? tg(`labels.seniority.${job.seniority}`) : "—"}${job.min_years_experience !== null ? ` · ${t("detail.years", { years: job.min_years_experience })}` : ""}` },
    { icon: MapPin, label: t("detail.location"), value: location || "—" },
    { icon: Wallet, label: t("detail.compensation"), value: salary },
    { icon: Languages, label: t("detail.languages"), value: job.languages.join(", ") || "—", className: "capitalize" },
    {
      icon: Plane,
      label: t("detail.mobility"),
      value:
        [
          job.travel_requirement ? tg(`labels.travel.${job.travel_requirement as "none" | "occasional" | "frequent"}`) : null,
          job.visa_sponsorship ? t("detail.visaSponsorship") : null,
          job.relocation_support ? t("detail.relocationSupport") : null,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    { icon: UserRound, label: t("detail.owner"), value: job.owner?.full_name || "—" },
    { icon: CalendarDays, label: t("detail.posted"), value: f.date(job.created_at) },
  ];

  // Matching state, shown as one banner under the numbers. "Hidden from partners" comes first (spec 2.2).
  const editTermsHref = `${editHref}#terms`;
  const banner = hidden
    ? {
        tone: "warning" as const,
        icon: EyeOff,
        title: t("nudge.title"),
        body:
          hidden === "network_hold"
            ? t("nudge.bodyHold")
            : hidden === "rules_not_accepted"
              ? t("nudge.bodyRules")
              : hidden === "no_terms"
            ? t("nudge.bodyTerms")
            : hidden === "not_permanent"
              ? t("nudge.bodyPermanent")
              : hidden === "no_client_name"
                ? t("nudge.bodyClientName")
                : t("nudge.bodyCurrency", { termsCurrency: terms.row?.currency ?? "", salaryCurrency: job.salary_currency }),
        // N10: the org-level CTA goes to the standing page (hold) or the accept page (rules), org admins only.
        cta: hidden === "network_hold" || hidden === "rules_not_accepted" ? isOrgAdmin : canWrite,
        ctaHref:
          hidden === "network_hold"
            ? `/workspace/${orgSlug}/settings/standing`
            : hidden === "rules_not_accepted"
              ? `/workspace/${orgSlug}/accept-rules?v=${encodeURIComponent(rulesLabel)}`
              : hidden === "not_permanent" ? editHref : hidden === "no_client_name" ? `${editHref}#client` : editTermsHref,
        ctaLabel: hidden === "network_hold" ? tn("banner.cta.standing") : hidden === "rules_not_accepted" ? tn("banner.cta.accept") : hidden === "no_terms" ? t("nudge.ctaTerms") : hidden === "currency_mismatch" ? t("nudge.ctaReview") : hidden === "no_client_name" ? t("nudge.ctaClientName") : t("nudge.ctaEdit"),
      }
    : !job.accepts_external_referrals
    ? { tone: "warning" as const, icon: EyeOff, title: t("detail.matchingClosed"), body: t("detail.privacyNotOpen"), cta: canWrite, ctaHref: editHref, ctaLabel: t("detail.editCta") }
    : job.status !== "active"
      ? { tone: "info" as const, icon: CircleDashed, title: t("detail.matchingPaused"), body: t("detail.privacyNotPublished"), cta: false, ctaHref: editHref, ctaLabel: "" }
      : {
          tone: "success" as const,
          icon: Radio,
          title: t("detail.matchingLive"),
          body: summary.last_refreshed_at ? t("detail.privacyShortRefreshed", { when: f.relative(summary.last_refreshed_at) }) : t("detail.privacyShort"),
          cta: false,
          ctaHref: editHref,
          ctaLabel: "",
        };
  const bannerTone = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    info: "bg-info-soft text-info",
  }[banner.tone];

  return (
    // One shrinkable track: truncated lists can't widen the page past 375px (AC-62, QA-PRE-03).
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={job.title}
        description={[job.client_name ? (job.client_confidential ? t("detail.clientConfidential", { client: job.client_name }) : job.client_name) : t("detail.clientNotSet"), tg(`labels.arrangement.${job.work_arrangement}`), tg(`labels.contract.${job.contract_type}`), location].filter(Boolean).join(" · ")}
        actions={
          <>
            <StatusPill tone={st.tone} label={tg(`labels.jobStatus.${job.status}`)} />
            {canWrite ? (
              <>
                <Button variant="outline" asChild><Link href={`/workspace/${orgSlug}/referrals?tab=pipeline&job=${jobId}`}><KanbanSquare className="size-4" aria-hidden /> {tp("title")}</Link></Button>
                <Button variant="outline" asChild><Link href={editHref}><Pencil className="size-4" aria-hidden /> {t("detail.edit")}</Link></Button>
                <JobStatusActions orgSlug={orgSlug} jobId={jobId} status={job.status} />
              </>
            ) : null}
          </>
        }
      />
      {sp.created ? <Flash message={job.status === "active" ? t("detail.flashPublished") : t("detail.flashDraft")} /> : null}
      {sp.updated ? <Flash message={t("detail.flashUpdated")} /> : null}

      {/* Key numbers: same pastel tiles as the overview */}
      <section className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
          <KpiTile tone="inbound" icon={Sparkles} label={t("detail.kpiStrong")} hint={t("detail.kpiPartnerHint")} value={matching ? String(summary.strong_count) : "—"} />
          <KpiTile tone="neutral" icon={CircleDashed} label={t("detail.kpiPartial")} hint={t("detail.kpiPartnerHint")} value={matching ? String(summary.potential_count) : "—"} />
          <KpiTile tone="inbound" icon={Inbox} label={t("detail.statSubmitted")} value={String(referrals.length)} />
          {/* The value is text that must wrap (fr feeShort.pctTotalCash is 31 characters): smaller type below xl (spec S3, §5.11). */}
          <KpiTile
            tone="money"
            icon={CircleDollarSign}
            label={t("detail.feeTerms")}
            value={current ? feeShort(current, tg, f) : tg("common.none")}
            valueClassName={current ? "text-lg leading-snug text-pretty break-words sm:text-2xl xl:text-3xl" : undefined}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", bannerTone)} aria-hidden>
            <banner.icon className={cn("size-4", banner.tone === "success" && "animate-pulse")} />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{banner.title}</span>
            <span className="text-muted-foreground"> · {banner.body}</span>
          </p>
          {banner.cta ? (
            <Button size="sm" variant="outline" className="min-h-11 sm:min-h-8" asChild>
              <Link href={banner.ctaHref}><Pencil className="size-3.5" aria-hidden /> {banner.ctaLabel}</Link>
            </Button>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          {/* Who partners sent you */}
          <Panel className="p-6">
            <SectionTitle
              action={referrals.length ? <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium tabular-nums">{referrals.length}</span> : undefined}
            >
              {t("detail.submittedTitle")}
            </SectionTitle>

            <ol className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {stages.map((s) => (
                <li key={s.key} className={cn("rounded-2xl px-3.5 py-3", s.count ? `${s.tone} text-tile-foreground` : "bg-muted/60 text-muted-foreground")}>
                  <p className="truncate text-xs font-medium">{t(`detail.${s.key}`)}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{s.count}</p>
                </li>
              ))}
            </ol>
            {closedCount > 0 ? <p className="mt-2 text-xs text-muted-foreground">{t("detail.pipelineClosed", { count: closedCount })}</p> : null}

            {referrals.length === 0 ? (
              <div className="mt-5 flex flex-col items-center rounded-3xl border border-dashed border-border px-6 py-10 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-tile-lilac text-tile-foreground" aria-hidden>
                  <Inbox className="size-6" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight">{t("detail.submittedEmptyTitle")}</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("detail.submittedEmptyBody")}</p>
                {matching && partnerFits > 0 ? (
                  <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-success-soft px-3.5 py-1.5 text-sm font-medium text-success">
                    <Sparkles className="size-4" aria-hidden />
                    {t("detail.submittedEmptyMatches", { count: partnerFits })}
                  </p>
                ) : null}
              </div>
            ) : (
              <ul className="-mx-2 mt-4 grid grid-cols-[minmax(0,1fr)] gap-0.5">
                {referrals.map((r) => (
                  <li key={r.id}>
                    <Link href={`/workspace/${orgSlug}/referrals/${r.id}`} className="group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                      <InitialsAvatar name={r.candidate_label} className="size-10 text-xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.candidate_label}</span>
                        <span className="block text-xs text-muted-foreground">{f.relative(r.submitted_at)}</span>
                      </span>
                      <StatusPill tone={REFERRAL_STATUS[r.status].tone} label={tg(`labels.referralStatus.${r.status}`)} />
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {job.description ? (
            <Panel className="p-6">
              <SectionTitle>{t("detail.description")}</SectionTitle>
              <ExpandableText text={job.description} moreLabel={t("detail.showMore")} lessLabel={t("detail.showLess")} />
            </Panel>
          ) : null}
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          {/* The role */}
          <Panel className="grid gap-6 p-6">
            <SectionTitle>{t("detail.role")}</SectionTitle>
            <div className="-mt-3 grid gap-4">
              <div className="grid gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">{t("detail.required")}</h3>
                <SkillChips skills={job.required_skills} emphasis />
              </div>
              {job.preferred_skills.length ? (
                <div className="grid gap-2">
                  <h3 className="text-xs font-medium text-muted-foreground">{t("detail.niceToHave")}</h3>
                  <SkillChips skills={job.preferred_skills} />
                </div>
              ) : null}
            </div>
            <dl className="grid gap-x-4 gap-y-4 border-t border-border/60 pt-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {details.map((d) => (
                <div key={d.label} className="flex min-w-0 items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground" aria-hidden>
                    <d.icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{d.label}</dt>
                    <dd className={cn("mt-0.5 text-sm font-medium break-words", d.className)}>{d.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Panel>

          {/* N2 (S3): the card partners read before submitting. */}
          {job.accepts_external_referrals || current ? (
            <Panel id="terms" className="p-6">
              <SectionTitle
                action={canWrite && current ? (
                  <Button variant="outline" size="sm" className="min-h-11 sm:min-h-8" asChild><Link href={editTermsHref}><Pencil className="size-3.5" aria-hidden /> {t("detail.editTerms")}</Link></Button>
                ) : current ? (
                  <span className="text-xs text-muted-foreground">{t("terms.versionLine", { version: current.versionNo, date: f.date(current.publishedAt) })}</span>
                ) : undefined}
              >
                {t("detail.termsTitle")}
              </SectionTitle>
              {current ? (
                <div className="grid gap-3">
                  {canWrite ? <p className="-mt-2 text-xs text-muted-foreground">{t("terms.versionLine", { version: current.versionNo, date: f.date(current.publishedAt) })}</p> : null}
                  <TermsSummary
                    variant="owner"
                    terms={current}
                    split={terms.split}
                    amountShown={ownerEstimate !== null}
                    estimate={ownerEstimate !== null ? (
                      <div className="grid gap-1 rounded-2xl bg-muted/40 p-3">
                        <p className="text-sm font-semibold tabular-nums">{t("form.terms.previewFee", { fee: f.money(ownerEstimate, current.currency, { code: true, whole: true }) })}</p>
                        <p className="text-xs text-muted-foreground">{t("form.terms.previewHint")}</p>
                      </div>
                    ) : null}
                  />
                </div>
              ) : (
                <div className="grid justify-items-start gap-3">
                  <p className="text-sm text-muted-foreground">{t("detail.termsEmpty")}</p>
                  {canWrite ? <Button size="sm" className="min-h-11 sm:min-h-8" asChild><Link href={editTermsHref}>{t("nudge.ctaTerms")}</Link></Button> : null}
                </div>
              )}
            </Panel>
          ) : null}

          {/* What partners can see before anyone is submitted */}
          <Panel className="p-6">
            <SectionTitle>{t("detail.visibilityTitle")}</SectionTitle>
            {job.accepts_external_referrals ? (
              <ul className="grid gap-1">
                {visibility.map((v) => (
                  <li key={v.label} className="flex items-center gap-3 rounded-xl py-1.5 text-sm">
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", v.shown ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")} aria-hidden>
                      {v.shown ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </span>
                    <span className={cn("min-w-0 flex-1", v.shown ? "font-medium" : "text-muted-foreground")}>{v.label}</span>
                    {!v.shown ? <span className="text-xs text-muted-foreground">{t("detail.hidden")}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <EyeOff className="size-4 shrink-0" aria-hidden /> {t("detail.visibilityClosed")}
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
