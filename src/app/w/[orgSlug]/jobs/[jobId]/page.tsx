import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeOff, Pencil, Sparkles, Users } from "lucide-react";
import { can, getRequestContext } from "@/server/auth/context";
import { getJob, listJobReferrals } from "@/features/jobs/queries";
import { getJobMatchSummary } from "@/features/matching/queries";
import { JobStatusActions } from "@/features/jobs/components/job-status-actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { KpiTile } from "@/components/shared/kpi-tile";
import { Flash } from "@/components/shared/flash";
import { ARRANGEMENT, CONTRACT, JOB_STATUS, REFERRAL_STATUS, SENIORITY, relativeTime } from "@/lib/labels";
import { formatMoney } from "@/lib/money/format";

export const metadata = { title: "Job" };

export default async function JobPage({ params, searchParams }: PageProps<"/w/[orgSlug]/jobs/[jobId]">) {
  const { orgSlug, jobId } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const job = await getJob(ctx, jobId);
  if (!job) notFound();
  const [summary, referrals] = await Promise.all([getJobMatchSummary(ctx, jobId), listJobReferrals(ctx, jobId)]);
  const st = JOB_STATUS[job.status];
  const visible = [
    "Title, seniority, arrangement & skills",
    job.share_description && "Description",
    job.share_location && "Location",
    job.share_salary && "Compensation",
    job.share_fee && "Expected fee",
    !job.client_confidential && "Client name",
  ].filter(Boolean) as string[];

  return (
    <div className="grid gap-6">
      {sp.created ? <Flash message={job.status === "active" ? "Job published. Matching runs in the background." : "Draft saved. Publish when you're ready."} /> : null}
      {sp.updated ? <Flash message="Changes saved." /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="mt-1 text-muted-foreground">
            {[job.client_name ? `${job.client_name}${job.client_confidential ? " · confidential to partners" : ""}` : "Client not set", ARRANGEMENT[job.work_arrangement], CONTRACT[job.contract_type]].join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={st.tone} label={st.label} />
          {can(ctx, "jobs:write") ? (
            <>
              <Button variant="outline" asChild><Link href={`/w/${orgSlug}/jobs/${jobId}/edit`}><Pencil className="size-4" aria-hidden /> Edit</Link></Button>
              <JobStatusActions orgSlug={orgSlug} jobId={jobId} status={job.status} />
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile label="Strong partner matches" hint="Anonymized count" value={job.accepts_external_referrals && job.status === "active" ? String(summary.strong_count) : "—"} tone="green" icon={Sparkles} />
        <KpiTile label="Potential matches" hint="Anonymized count" value={job.accepts_external_referrals && job.status === "active" ? String(summary.potential_count) : "—"} tone="blue" icon={Users} />
        <KpiTile label="Submissions received" value={String(referrals.length)} tone="lilac" icon={Users} href={`/w/${orgSlug}/referrals?tab=received`} />
      </div>
      <p className="-mt-2 flex items-start gap-2 text-sm text-muted-foreground">
        <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
        {job.accepts_external_referrals
          ? `Partner candidates are never identified to you before a referral. Counts refresh as profiles change${summary.last_refreshed_at ? ` (last ${relativeTime(summary.last_refreshed_at)})` : ""}.`
          : "Partner referrals are off for this job. Turn them on to be matched with candidates from partner recruiters."}
      </p>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <SectionTitle>Received submissions</SectionTitle>
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submissions yet. Partner recruiters decide whether to submit their matching candidates.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {referrals.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <Link href={`/w/${orgSlug}/referrals/${r.id}`} className="font-medium underline-offset-4 hover:underline">{r.candidate_label}</Link>
                  <span className="flex items-center gap-3 text-sm text-muted-foreground">
                    {relativeTime(r.submitted_at)}
                    <StatusPill tone={REFERRAL_STATUS[r.status].tone} label={REFERRAL_STATUS[r.status].label} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="grid content-start gap-4">
          <SectionTitle>Requirements</SectionTitle>
          <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Required</dt><dd>{job.required_skills.join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">Nice to have</dt><dd>{job.preferred_skills.join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">Seniority</dt><dd>{job.seniority ? SENIORITY[job.seniority] : "—"}{job.min_years_experience !== null ? ` · ${job.min_years_experience}+ yrs` : ""}</dd>
            <dt className="text-muted-foreground">Languages</dt><dd>{job.languages.join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">Location</dt><dd>{[job.location_city, job.location_region, job.location_country].filter(Boolean).join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">Compensation</dt><dd>{job.salary_min || job.salary_max ? `${formatMoney(job.salary_min, job.salary_currency)} – ${formatMoney(job.salary_max, job.salary_currency)}` : "—"}</dd>
            <dt className="text-muted-foreground">Expected fee</dt><dd>{formatMoney(job.expected_fee_minor, job.fee_currency)}</dd>
          </dl>
          {job.accepts_external_referrals ? (
            <div className="rounded-2xl bg-muted p-4 text-sm">
              <p className="font-medium">Partners see before a referral</p>
              <p className="mt-1 text-muted-foreground">{visible.join(" · ")}</p>
            </div>
          ) : null}
          {job.description ? <p className="text-sm whitespace-pre-line text-muted-foreground">{job.description}</p> : null}
        </Panel>
      </div>
    </div>
  );
}
