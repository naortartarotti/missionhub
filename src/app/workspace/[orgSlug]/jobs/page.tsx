import Link from "next/link";
import { BriefcaseBusiness, EyeOff, Plus, Search, TriangleAlert } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { getJobsTermsState, listJobs } from "@/features/jobs/queries";
import { hiddenReasonOf, NUDGE_CHIP, restrictionReasonOf } from "@/features/jobs/nudge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { Panel } from "@/components/shared/card";
import { NativeSelect } from "@/components/shared/native-select";
import { JOB_STATUS } from "@/lib/labels";
import { SegmentedNav } from "@/components/shared/segmented-nav";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("jobs"))("title") };
}

export default async function JobsPage({ params, searchParams }: PageProps<"/workspace/[orgSlug]/jobs">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "all";
  const owner = sp.owner === "me" ? "me" : "team";
  const [jobs, termsState, { data: activeOpen }] = await Promise.all([
    listJobs(ctx, { q, status, mine: owner === "me" }),
    getJobsTermsState(ctx),
    // The banner counts every active open job of the org, whatever the list filters (spec S2).
    ctx.db.from("jobs").select("id").eq("organization_id", ctx.organizationId).eq("status", "active").eq("accepts_external_referrals", true),
  ]);
  const jobsActive = new Set((activeOpen ?? []).map((j) => j.id));
  // N2 nudge (BR-7, spec 2.2): active referral-open jobs partners can't see, with the owner-only reason.
  const stateByJob = new Map(termsState.map((r) => [r.job_id, r]));
  const hiddenOf = (j: { id: string; status: string; accepts_external_referrals: boolean }) =>
    j.status === "active" && j.accepts_external_referrals ? (restrictionReasonOf(ctx.restriction) ?? hiddenReasonOf(stateByJob.get(j.id))) : null;
  const hiddenCount = restrictionReasonOf(ctx.restriction) ? jobsActive.size : termsState.filter((r) => hiddenReasonOf(r) && jobsActive.has(r.job_id)).length;
  const base = `/workspace/${orgSlug}/jobs`;
  const [t, tg, tc, f] = await Promise.all([getT("jobs"), getGlobalT(), getT("common"), getFormatter()]);
  const { count: othersOwned } = await ctx.db.from("jobs").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).neq("owner_id", ctx.userId);
  const team = (othersOwned ?? 0) > 0;
  const scopeHref = (o: string) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}), ...(o === "me" ? { owner: "me" } : {}) })}`;
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<Button asChild><Link href={`${base}/new`}><Plus className="size-4" aria-hidden /> {t("newJob")}</Link></Button>}
      />
      {team || owner === "me" ? (
        <SegmentedNav
          label={tc("ownerScope.label")}
          active={owner}
          segments={[
            { key: "team", label: tc("ownerScope.team"), href: scopeHref("team") },
            { key: "me", label: tc("ownerScope.mine"), href: scopeHref("me") },
          ]}
        />
      ) : null}
      {hiddenCount > 0 ? (
        <Alert className="rounded-2xl border-warning/30 bg-warning-soft text-warning">
          <TriangleAlert aria-hidden />
          <AlertDescription className="text-foreground">{t("nudge.listBanner", { count: hiddenCount })}</AlertDescription>
        </Alert>
      ) : null}
      <form className="flex flex-col gap-2 sm:flex-row" role="search" action={base}>
        {owner === "me" ? <input type="hidden" name="owner" value="me" /> : null}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="pl-10" aria-label={t("searchLabel")} />
        </div>
        <div className="sm:w-48">
          <NativeSelect name="status" defaultValue={status} aria-label={t("filterLabel")}>
            <option value="all">{t("allStatuses")}</option>
            {Object.keys(JOB_STATUS).map((k) => <option key={k} value={k}>{tg(`labels.jobStatus.${k as keyof typeof JOB_STATUS}`)}</option>)}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">{t("apply")}</Button>
      </form>
      {jobs.length === 0 ? (
        <EmptyState
          icon={BriefcaseBusiness}
          title={q || status !== "all" ? t("empty.filteredTitle") : t("empty.firstTitle")}
          description={q || status !== "all" ? t("empty.filteredDescription") : t("empty.firstDescription")}
          action={<Button asChild><Link href={`${base}/new`}>{t("newJob")}</Link></Button>}
        />
      ) : (
        <div className="grid gap-3">
          {jobs.map((j) => {
            const hidden = hiddenOf(j);
            return (
            <Link key={j.id} href={`${base}/${j.id}`} className="block rounded-3xl focus-visible:outline-2">
              <Panel className="flex flex-col gap-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{j.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {[j.client_name ? (j.client_confidential ? t("clientConfidential", { client: j.client_name }) : j.client_name) : null, tg(`labels.arrangement.${j.work_arrangement}`), [j.location_city, j.location_region].filter(Boolean).join(", "), team ? j.owner?.full_name : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {hidden ? (
                    // Wraps to 2 lines in fr at 375px; never truncated (spec S2, §5.11).
                    <span className="inline-flex max-w-full items-start gap-1.5 mt-2 rounded-2xl bg-warning-soft px-2.5 py-1 text-xs font-medium whitespace-normal text-pretty text-warning">
                      <EyeOff className="mt-px size-3.5 shrink-0" aria-hidden />
                      {t(NUDGE_CHIP[hidden])}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {j.source === "integration" || j.source === "api" || j.source === "csv_import" ? <span className="rounded-full bg-violet-soft px-2.5 py-1 text-xs font-medium text-violet">{tc("imported")}</span> : null}
                  {j.accepts_external_referrals && !hidden ? <span className="rounded-full bg-tile-blue px-2.5 py-1 text-xs font-medium text-tile-foreground">{t("openToPartners")}</span> : null}
                  <span>{f.relative(j.updated_at)}</span>
                  <StatusPill tone={JOB_STATUS[j.status].tone} label={tg(`labels.jobStatus.${j.status}`)} />
                </div>
              </Panel>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
