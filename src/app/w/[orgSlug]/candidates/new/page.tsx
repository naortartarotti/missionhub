import { getRequestContext, assertCan } from "@/server/auth/context";
import { createCandidate } from "@/features/candidates/actions";
import { CandidateForm } from "@/features/candidates/components/candidate-form";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "Add candidate" };

export default async function NewCandidatePage({ params }: PageProps<"/w/[orgSlug]/candidates/new">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "candidates:write");
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader
        title="Add candidate"
        description="New candidates start as drafts. Record a processing authorization, then activate them for matching."
      />
      <CandidateForm
        action={createCandidate.bind(null, orgSlug)}
        cancelHref={`/w/${orgSlug}/candidates`}
        submitLabel="Save candidate"
        defaults={{ salaryCurrency: ctx.currency }}
      />
    </div>
  );
}
