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
import { ARRANGEMENT, JOB_STATUS, relativeTime } from "@/lib/labels";

export const metadata = { title: "Jobs" };

export default async function JobsPage({ params, searchParams }: PageProps<"/w/[orgSlug]/jobs">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "all";
  const jobs = await listJobs(ctx, { q, status });
  const base = `/w/${orgSlug}/jobs`;
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Jobs"
        description="Your open roles. Opt in to partner referrals to reach candidates in other recruiters' private networks."
        actions={<Button asChild><Link href={`${base}/new`}><Plus className="size-4" aria-hidden /> New job</Link></Button>}
      />
      <form className="flex flex-col gap-2 sm:flex-row" role="search" action={base}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Search by title or client" className="pl-10" aria-label="Search jobs" />
        </div>
        <div className="sm:w-48">
          <NativeSelect name="status" defaultValue={status} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {Object.entries(JOB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
      {jobs.length === 0 ? (
        <EmptyState
          icon={BriefcaseBusiness}
          title={q || status !== "all" ? "No jobs match these filters" : "Publish your first job"}
          description="Jobs that accept partner referrals are matched against other recruiters' private candidates, without exposing anyone's identity."
          action={<Button asChild><Link href={`${base}/new`}>New job</Link></Button>}
        />
      ) : (
        <div className="grid gap-3">
          {jobs.map((j) => (
            <Link key={j.id} href={`${base}/${j.id}`} className="block rounded-3xl focus-visible:outline-2">
              <Panel className="flex flex-col gap-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{j.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {[j.client_name ? `${j.client_name}${j.client_confidential ? " (confidential)" : ""}` : null, ARRANGEMENT[j.work_arrangement], [j.location_city, j.location_region].filter(Boolean).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {j.accepts_external_referrals ? <span className="rounded-full bg-tile-blue px-2.5 py-1 text-xs font-medium text-tile-foreground">Partner referrals on</span> : null}
                  <span>{relativeTime(j.updated_at)}</span>
                  <StatusPill tone={JOB_STATUS[j.status].tone} label={JOB_STATUS[j.status].label} />
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
