import { assertCan, getRequestContext } from "@/server/auth/context";
import { jobNetworkState } from "@/features/network-rules/job-network";
import { createJob } from "@/features/jobs/actions";
import { NewJobFlow } from "@/features/jobs/components/job-import";
import { getT } from "@/i18n/server";
import { integrations } from "@/server/env";
import { getDefaultRule, termsFormContext } from "@/features/jobs/terms-context";

export async function generateMetadata() {
  return { title: (await getT("jobs"))("new.title") };
}

export default async function NewJobPage({
  params,
}: PageProps<"/workspace/[orgSlug]/jobs/new">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "jobs:write");
  const [t, split] = await Promise.all([getT("jobs"), getDefaultRule(ctx)]);
  return (
    <NewJobFlow
      title={t("new.title")}
      description={t("new.description")}
      orgSlug={orgSlug}
      action={createJob.bind(null, orgSlug)}
      cancelHref={`/workspace/${orgSlug}/jobs`}
      ai={integrations.ai}
      terms={termsFormContext(null, split)}
      defaults={{ salaryCurrency: ctx.currency }}
      network={jobNetworkState(ctx, `/workspace/${orgSlug}/jobs/new`)}
    />
  );
}
