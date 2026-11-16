import { createClient } from "@/server/supabase/server";
import { Panel } from "@/components/shared/card";
import { PageHeader } from "@/components/shared/page-header";
import { getT } from "@/i18n/server";
import { isUuid } from "@/features/admin/referral-lookup";
import { AdminNewCaseForm } from "@/features/network-rules/components/admin-new-case-form";

export async function generateMetadata() {
  return { title: (await getT("admin"))("conduct.newCaseTitle") };
}

/** S18: open a conduct case without a reporter (BR-24). Platform admins only (admin layout). */
export default async function NewConductCasePage({ searchParams }: PageProps<"/admin/disputes/conduct/new">) {
  const sp = await searchParams;
  const db = await createClient();
  const [t, { data: orgs }] = await Promise.all([getT("admin"), db.from("organizations").select("id, name").order("name").limit(500)]);
  const org = typeof sp.org === "string" && isUuid(sp.org) ? sp.org : null;
  return (
    <div className="grid gap-6">
      <PageHeader title={t("conduct.newCaseTitle")} />
      <Panel className="max-w-3xl">
        <AdminNewCaseForm orgs={orgs ?? []} defaultOrgId={org} />
      </Panel>
    </div>
  );
}
