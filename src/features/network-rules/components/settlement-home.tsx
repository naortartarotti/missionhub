import { Panel } from "@/components/shared/card";
import { PageHeader } from "@/components/shared/page-header";
import type { RequestContext } from "@/server/auth/context";
import { getT } from "@/i18n/server";
import { getSettlementSummary } from "../queries";
import { SettlementCanDo } from "./settlement";

/**
 * S22-b settlement home (§2.10 item 4): what the org can still do (counts scoped to in-flight
 * records, BR-37) and what's paused. The B6 banner above carries the legal-draft sentences.
 */
export async function SettlementHome({ ctx }: { ctx: RequestContext }) {
  const t = await getT("network");
  const counts = await getSettlementSummary(ctx).catch(() => null);
  return (
    <div className="grid gap-6">
      <PageHeader title={t("settlement.homeTitle")} description={ctx.organizationName} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SettlementCanDo orgSlug={ctx.organizationSlug} isOrgAdmin={ctx.membershipRole === "org_admin"} counts={counts} />
        <Panel className="grid content-start gap-2">
          <h2 className="text-base font-semibold">{t("settlement.paused")}</h2>
          <p className="text-sm text-muted-foreground text-pretty">{t("settlement.pausedList")}</p>
        </Panel>
      </div>
    </div>
  );
}
