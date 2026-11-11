import { assertCan, getRequestContext } from "@/server/auth/context";
import { createJob } from "@/features/jobs/actions";
import { NewJobFlow } from "@/features/jobs/components/job-import";
import { getT } from "@/i18n/server";
import { integrations } from "@/server/env";

export async function generateMetadata() {
  return { title: (await getT("jobs"))("new.title") };
}

export default async function NewJobPage({
  params,
}: PageProps<"/workspace/[orgSlug]/jobs/new">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "jobs:write");
  const t = await getT("jobs");
  return (
    <NewJobFlow
      title={t("new.title")}
      description={t("new.description")}
      orgSlug={orgSlug}
      action={createJob.bind(null, orgSlug)}
      cancelHref={`/workspace/${orgSlug}/jobs`}
      ai={integrations.ai}
      defaults={{ salaryCurrency: ctx.currency, feeCurrency: ctx.currency }}
    />
  );
}
