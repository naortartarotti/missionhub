import { createClient } from "@/server/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { getT } from "@/i18n/server";
import { listNetworkRules } from "@/features/network-rules/admin-queries";
import { RulesVersionForm } from "@/features/network-rules/components/rules-version-form";

export async function generateMetadata() {
  return { title: (await getT("admin"))("networkRules.new") };
}

/** S6: new version. `initial` only while nothing was ever published; disabled publish while one is upcoming. */
export default async function NewNetworkRulesVersionPage() {
  const db = await createClient();
  const [t, raw] = await Promise.all([getT("admin"), listNetworkRules(db)]);
  const rows = (Array.isArray(raw) ? raw : []) as { status: string; is_upcoming: boolean }[];
  const published = rows.filter((r) => r.status === "published");
  return (
    <div className="grid gap-6">
      <PageHeader title={t("networkRules.new")} description={t("networkRules.description")} />
      <RulesVersionForm initial={null} initialAllowed={published.length === 0} hasUpcoming={published.some((r) => r.is_upcoming)} />
    </div>
  );
}
