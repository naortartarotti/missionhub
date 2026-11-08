import { can, getRequestContext } from "@/server/auth/context";
import { integrations } from "@/server/env";
import { OrgSettingsForm } from "@/features/organizations/components/org-settings-form";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/w/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel>
        <SectionTitle>Organization</SectionTitle>
        <OrgSettingsForm orgSlug={orgSlug} name={ctx.organizationName} currency={ctx.currency} disabled={!can(ctx, "team:manage")} />
      </Panel>
      <Panel>
        <SectionTitle>Integrations</SectionTitle>
        <ul className="grid gap-3 text-sm">
          <li className="flex items-center justify-between gap-3">
            <span><span className="font-medium">AI extraction & explanations</span><span className="block text-muted-foreground">Matching uses deterministic, rule-based scoring without it.</span></span>
            <StatusPill tone={integrations.ai ? "success" : "neutral"} label={integrations.ai ? "Configured" : "Not configured"} />
          </li>
          <li className="flex items-center justify-between gap-3">
            <span><span className="font-medium">Transactional email</span><span className="block text-muted-foreground">Without it, notifications are in-app only.</span></span>
            <StatusPill tone={integrations.email ? "success" : "neutral"} label={integrations.email ? "Configured" : "Not configured"} />
          </li>
          <li className="flex items-center justify-between gap-3">
            <span><span className="font-medium">Payments provider</span><span className="block text-muted-foreground">Settlement is recorded through a verified manual ledger. No funds move through MissionHub.</span></span>
            <StatusPill tone="neutral" label="Manual ledger" />
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">Data residency: configure your Supabase project in a Canadian region (ca-central-1). Subprocessors such as AI or email vendors may process data outside Canada.</p>
      </Panel>
    </div>
  );
}
