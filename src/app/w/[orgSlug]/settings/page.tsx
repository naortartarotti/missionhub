import { can, getRequestContext } from "@/server/auth/context";
import { integrations } from "@/server/env";
import { OrgSettingsForm } from "@/features/organizations/components/org-settings-form";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("settings"))("title") };
}

export default async function SettingsPage({ params }: PageProps<"/w/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  const [ctx, t] = await Promise.all([getRequestContext(orgSlug), getT("settings")]);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel>
        <SectionTitle>{t("organization.title")}</SectionTitle>
        <OrgSettingsForm orgSlug={orgSlug} name={ctx.organizationName} currency={ctx.currency} disabled={!can(ctx, "team:manage")} />
      </Panel>
      <Panel>
        <SectionTitle>{t("integrations.title")}</SectionTitle>
        <ul className="grid gap-3 text-sm">
          <li className="flex items-center justify-between gap-3">
            <span><span className="font-medium">{t("integrations.aiName")}</span><span className="block text-muted-foreground">{t("integrations.aiDescription")}</span></span>
            <StatusPill tone={integrations.ai ? "success" : "neutral"} label={integrations.ai ? t("integrations.configured") : t("integrations.notConfigured")} />
          </li>
          <li className="flex items-center justify-between gap-3">
            <span><span className="font-medium">{t("integrations.emailName")}</span><span className="block text-muted-foreground">{t("integrations.emailDescription")}</span></span>
            <StatusPill tone={integrations.email ? "success" : "neutral"} label={integrations.email ? t("integrations.configured") : t("integrations.notConfigured")} />
          </li>
          <li className="flex items-center justify-between gap-3">
            <span><span className="font-medium">{t("integrations.paymentsName")}</span><span className="block text-muted-foreground">{t("integrations.paymentsDescription")}</span></span>
            <StatusPill tone="neutral" label={t("integrations.manualLedger")} />
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">{t("integrations.residency")}</p>
      </Panel>
    </div>
  );
}
