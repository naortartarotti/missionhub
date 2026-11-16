import { notFound } from "next/navigation";
import { createClient } from "@/server/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { getT } from "@/i18n/server";
import { getNetworkRulesVersion, listNetworkRules } from "@/features/network-rules/admin-queries";
import { RULES_LOCALES, type RulesLocale, type VersionType } from "@/features/network-rules/domain";
import { RulesVersionForm } from "@/features/network-rules/components/rules-version-form";

export async function generateMetadata() {
  return { title: (await getT("admin"))("networkRules.title") };
}

type Version = {
  id: string;
  label: string;
  type: VersionType;
  status: string;
  effective_on: string | null;
  legal_reason: string | null;
  approval_reference: string | null;
  texts: Partial<Record<RulesLocale, { body: string; change_summary: string | null }>>;
};

/** S6 for a draft. Published versions can't be edited (not found here; immutable in the DB). */
export default async function EditNetworkRulesDraftPage({ params }: PageProps<"/admin/network-rules/[id]/edit">) {
  const { id } = await params;
  const db = await createClient();
  const [t, raw, list] = await Promise.all([getT("admin"), getNetworkRulesVersion(db, id), listNetworkRules(db)]);
  const v = raw as unknown as Version | null;
  if (!v || v.status === "published") notFound();
  const rows = (Array.isArray(list) ? list : []) as { status: string; is_upcoming: boolean }[];
  const published = rows.filter((r) => r.status === "published");
  const texts = Object.fromEntries(RULES_LOCALES.map((l) => [l, v.texts[l]?.body ?? ""])) as Record<RulesLocale, string>;
  const summaries = Object.fromEntries(RULES_LOCALES.map((l) => [l, v.texts[l]?.change_summary ?? ""])) as Record<RulesLocale, string>;
  return (
    <div className="grid gap-6">
      <PageHeader title={`${t("networkRules.title")} · ${v.label}`} description={t("networkRules.description")} />
      <RulesVersionForm
        initialAllowed={published.length === 0}
        hasUpcoming={published.some((r) => r.is_upcoming)}
        initial={{ draftId: v.id, label: v.label, type: v.type, effectiveOn: v.effective_on ?? "", texts, summaries, legalReason: v.legal_reason ?? "", approvalReference: v.approval_reference ?? "" }}
      />
    </div>
  );
}
