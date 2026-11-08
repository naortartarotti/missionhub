import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, EyeOff, Inbox, Pencil } from "lucide-react";
import { can, getRequestContext } from "@/server/auth/context";
import { getJob, listJobReferrals } from "@/features/jobs/queries";
import { getJobMatchSummary } from "@/features/matching/queries";
import { JobStatusActions } from "@/features/jobs/components/job-status-actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { StatTile } from "@/components/shared/stat-tile";
import { SkillChips } from "@/components/shared/skill-chips";
import { Disclosure } from "@/components/shared/disclosure";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Flash } from "@/components/shared/flash";
import { JOB_STATUS, REFERRAL_STATUS } from "@/lib/labels";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("jobs"))("detail.metaTitle") };
}

export default async function JobPage({ params, searchParams }: PageProps<"/w/[orgSlug]/jobs/[jobId]">) {
  const { orgSlug, jobId } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const job = await getJob(ctx, jobId);
  if (!job) notFound();
  const [summary, referrals, t, tg, f] = await Promise.all([getJobMatchSummary(ctx, jobId), listJobReferrals(ctx, jobId), getT("jobs"), getGlobalT(), getFormatter()]);
  const st = JOB_STATUS[job.status];
  const matching = job.accepts_external_referrals && job.status === "active";
  const location = [job.location_city, job.location_region, job.location_country].filter(Boolean).join(", ");
  const visible = [
    t("detail.visible.always"),
    job.share_description && t("detail.visible.description"),
    job.share_location && t("detail.visible.location"),
    job.share_salary && t("detail.visible.compensation"),
    job.share_fee && t("detail.visible.placementFee"),
    !job.client_confidential && t("detail.visible.clientName"),
  ].filter(Boolean) as string[];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={job.title}
        description={[job.client_name ? (job.client_confidential ? t("detail.clientConfidential", { client: job.client_name }) : job.client_name) : t("detail.clientNotSet"), tg(`labels.arrangement.${job.work_arrangement}`), tg(`labels.contract.${job.contract_type}`), location].filter(Boolean).join(" · ")}
        actions={
          <>
            <StatusPill tone={st.tone} label={tg(`labels.jobStatus.${job.status}`)} />
            {can(ctx, "jobs:write") ? (
              <>
                <Button variant="outline" asChild><Link href={`/w/${orgSlug}/jobs/${jobId}/edit`}><Pencil className="size-4" aria-hidden /> {t("detail.edit")}</Link></Button>
                <JobStatusActions orgSlug={orgSlug} jobId={jobId} status={job.status} />
              </>
            ) : null}
          </>
        }
      />
      {sp.created ? <Flash message={job.status === "active" ? t("detail.flashPublished") : t("detail.flashDraft")} /> : null}
      {sp.updated ? <Flash message={t("detail.flashUpdated")} /> : null}

      {/* Key numbers (same tiles as the match panel) + one line on privacy/matching state */}
      <section className="grid gap-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label={t("detail.kpiStrong")} value={matching ? String(summary.strong_count) : "—"} hint={t("detail.kpiPartnerHint")} />
          <StatTile label={t("detail.kpiPartial")} value={matching ? String(summary.potential_count) : "—"} hint={t("detail.kpiPartnerHint")} />
          <StatTile label={t("detail.statSubmitted")} value={String(referrals.length)} />
          <StatTile label={t("detail.placementFee")} value={job.expected_fee_minor ? f.money(job.expected_fee_minor, job.fee_currency, { whole: true }) : "—"} tone={job.expected_fee_minor ? "success" : undefined} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <EyeOff className="size-3.5 shrink-0" aria-hidden />
          {!job.accepts_external_referrals
            ? t("detail.privacyNotOpen")
            : job.status !== "active"
              ? t("detail.privacyNotPublished")
              : summary.last_refreshed_at
                ? t("detail.privacyShortRefreshed", { when: f.relative(summary.last_refreshed_at) })
                : t("detail.privacyShort")}
        </p>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* Who partners sent you */}
        <Panel className="content-start">
          <SectionTitle>{t("detail.submittedTitle")}</SectionTitle>
          {referrals.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
              <Inbox className="size-5 shrink-0" aria-hidden />
              {t("detail.submittedEmptyShort")}
            </div>
          ) : (
            <ul className="-mx-2 grid gap-0.5">
              {referrals.map((r) => (
                <li key={r.id}>
                  <Link href={`/w/${orgSlug}/referrals/${r.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                    <InitialsAvatar name={r.candidate_label} className="size-9 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.candidate_label}</span>
                      <span className="block text-xs text-muted-foreground">{f.relative(r.submitted_at)}</span>
                    </span>
                    <StatusPill tone={REFERRAL_STATUS[r.status].tone} label={tg(`labels.referralStatus.${r.status}`)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* The role, in the same blocks as the match panel */}
        <Panel className="grid content-start gap-5">
          <SectionTitle>{t("detail.role")}</SectionTitle>
          <div className="grid gap-2.5">
            <h3 className="text-xs font-medium text-muted-foreground">{t("detail.required")}</h3>
            <SkillChips skills={job.required_skills} />
            {job.preferred_skills.length ? (
              <>
                <h3 className="mt-1 text-xs font-medium text-muted-foreground">{t("detail.niceToHave")}</h3>
                <SkillChips skills={job.preferred_skills} />
              </>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">{t("detail.seniority")}</dt><dd className="mt-0.5 font-medium">{job.seniority ? tg(`labels.seniority.${job.seniority}`) : "—"}{job.min_years_experience !== null ? ` · ${t("detail.years", { years: job.min_years_experience })}` : ""}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("detail.location")}</dt><dd className="mt-0.5 font-medium">{location || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("detail.compensation")}</dt><dd className="mt-0.5 font-medium">{job.salary_min || job.salary_max ? `${f.money(job.salary_min, job.salary_currency, { whole: true })} – ${f.money(job.salary_max, job.salary_currency, { whole: true })}` : "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("detail.languages")}</dt><dd className="mt-0.5 font-medium">{job.languages.join(", ") || "—"}</dd></div>
          </dl>
          {job.accepts_external_referrals ? (
            <div className="grid gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Eye className="size-3.5" aria-hidden />{t("detail.visibleShort")}</h3>
              <SkillChips skills={visible} />
            </div>
          ) : null}
          {job.description ? <Disclosure summary={t("detail.description")}>{job.description}</Disclosure> : null}
        </Panel>
      </div>
    </div>
  );
}
