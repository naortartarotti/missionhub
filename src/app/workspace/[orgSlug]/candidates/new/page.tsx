import { getRequestContext, assertCan } from "@/server/auth/context";
import { createCandidate } from "@/features/candidates/actions";
import { NewCandidateFlow } from "@/features/candidates/components/resume-import";
import { integrations } from "@/server/env";
import { PageHeader } from "@/components/shared/page-header";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("candidates"))("new.title") };
}

export default async function NewCandidatePage({ params }: PageProps<"/workspace/[orgSlug]/candidates/new">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "candidates:write");
  const t = await getT("candidates");
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("new.title")}
        description={t("new.description")}
      />
      <div className="grid w-full gap-6">
      <NewCandidateFlow
        orgSlug={orgSlug}
        ai={integrations.ai}
        action={createCandidate.bind(null, orgSlug)}
        cancelHref={`/workspace/${orgSlug}/candidates`}
        submitLabel={t("new.submit")}
        defaults={{ salaryCurrency: ctx.currency }}
      />
    </div>
    </div>
  );
}
