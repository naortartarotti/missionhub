import Link from "next/link";
import { BriefcaseBusiness, Plus, Search } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { listJobs } from "@/features/jobs/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { Panel } from "@/components/shared/card";
import { NativeSelect } from "@/components/shared/native-select";
import { JOB_STATUS } from "@/lib/labels";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("jobs"))("title") };
}

export default async function JobsPage({ params, searchParams }: PageProps<"/w/[orgSlug]/jobs">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "all";
  const jobs = await listJobs(ctx, { q, status });
  const base = `/w/${orgSlug}/jobs`;
  const [t, tg, f] = await Promise.all([getT("jobs"), getGlobalT(), getFormatter()]);
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<Button asChild><Link href={`${base}/new`}><Plus className="size-4" aria-hidden /> {t("newJob")}</Link></Button>}
      />
      <form className="flex flex-col gap-2 sm:flex-row" role="search" action={base}>
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
          {jobs.map((j) => (
            <Link key={j.id} href={`${base}/${j.id}`} className="block rounded-3xl focus-visible:outline-2">
              <Panel className="flex flex-col gap-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{j.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {[j.client_name ? (j.client_confidential ? t("clientConfidential", { client: j.client_name }) : j.client_name) : null, tg(`labels.arrangement.${j.work_arrangement}`), [j.location_city, j.location_region].filter(Boolean).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {j.accepts_external_referrals ? <span className="rounded-full bg-tile-blue px-2.5 py-1 text-xs font-medium text-tile-foreground">{t("openToPartners")}</span> : null}
                  <span>{f.relative(j.updated_at)}</span>
                  <StatusPill tone={JOB_STATUS[j.status].tone} label={tg(`labels.jobStatus.${j.status}`)} />
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
