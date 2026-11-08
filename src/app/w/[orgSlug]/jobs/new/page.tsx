import { assertCan, getRequestContext } from "@/server/auth/context";
import { createJob } from "@/features/jobs/actions";
import { JobForm } from "@/features/jobs/components/job-form";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "New job" };

export default async function NewJobPage({ params }: PageProps<"/w/[orgSlug]/jobs/new">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "jobs:write");
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader title="New job" description="Paste a description to get suggested requirements, then review every field before publishing." />
      <JobForm orgSlug={orgSlug} action={createJob.bind(null, orgSlug)} cancelHref={`/w/${orgSlug}/jobs`} isNew defaults={{ salaryCurrency: ctx.currency, feeCurrency: ctx.currency }} />
    </div>
  );
}
