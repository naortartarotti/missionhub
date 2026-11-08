import { assertCan, getRequestContext } from "@/server/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { ImportWizard } from "@/features/candidates/components/import-wizard";

export const metadata = { title: "Import candidates" };

export default async function ImportPage({ params }: PageProps<"/w/[orgSlug]/candidates/import">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "candidates:write");
  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <PageHeader
        title="Import candidates"
        description="Upload a CSV, review every row, then confirm. Duplicate checks run only within your organization."
      />
      <ImportWizard orgSlug={orgSlug} />
    </div>
  );
}
