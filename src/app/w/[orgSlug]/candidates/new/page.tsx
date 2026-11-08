import { getRequestContext, assertCan } from "@/server/auth/context";
import { createCandidate } from "@/features/candidates/actions";
import { CandidateForm } from "@/features/candidates/components/candidate-form";
import { PageHeader } from "@/components/shared/page-header";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("candidates"))("new.title") };
}

export default async function NewCandidatePage({ params }: PageProps<"/w/[orgSlug]/candidates/new">) {
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
      <div className="mx-auto grid w-full max-w-4xl gap-6">
      <CandidateForm
        action={createCandidate.bind(null, orgSlug)}
        cancelHref={`/w/${orgSlug}/candidates`}
        submitLabel={t("new.submit")}
        defaults={{ salaryCurrency: ctx.currency }}
      />
    </div>
    </div>
  );
}
