import { assertCan, getRequestContext } from "@/server/auth/context";
import { createJob } from "@/features/jobs/actions";
import { JobForm } from "@/features/jobs/components/job-form";
import { PageHeader } from "@/components/shared/page-header";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("jobs"))("new.title") };
}

export default async function NewJobPage({ params }: PageProps<"/w/[orgSlug]/jobs/new">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "jobs:write");
  const t = await getT("jobs");
  return (
    <div className="grid gap-6">
      <PageHeader title={t("new.title")} description={t("new.description")} />
      <div className="grid w-full gap-6">
      <JobForm orgSlug={orgSlug} action={createJob.bind(null, orgSlug)} cancelHref={`/w/${orgSlug}/jobs`} isNew defaults={{ salaryCurrency: ctx.currency, feeCurrency: ctx.currency }} />
    </div>
    </div>
  );
}
