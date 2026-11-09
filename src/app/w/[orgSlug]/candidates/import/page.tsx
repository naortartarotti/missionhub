import { assertCan, getRequestContext } from "@/server/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { ImportWizard } from "@/features/candidates/components/import-wizard";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("candidates"))("import.title") };
}

export default async function ImportPage({ params }: PageProps<"/w/[orgSlug]/candidates/import">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "candidates:write");
  const t = await getT("candidates");
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("import.title")}
        description={t("import.description")}
      />
      <div className="grid w-full gap-6">
      <ImportWizard orgSlug={orgSlug} />
    </div>
    </div>
  );
}
